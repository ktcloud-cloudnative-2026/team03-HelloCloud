#!/usr/bin/env python3
"""Transfer prod DB credentials through stdin/stdout without credential files/logs."""
import base64
import json
from pathlib import Path
import subprocess
import sys

NS = 'ideaconnection-prod'
ISSUER = 'https://ideaconnection.jpexstudio.com/realms/hellocloud'


def kube(args, payload=None):
    result = subprocess.run(['kubectl', *args], input=payload, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Kubernetes operation failed')
    return json.loads(result.stdout) if result.stdout.strip() else None


def read_env(path, key):
    for line in Path(path).read_text().splitlines():
        if line.startswith(key + '='):
            value = line.split('=', 1)[1]
            if value and value.isalnum():
                return value
            raise RuntimeError('Expected generated alphanumeric credential')
    raise RuntimeError('Required credential key is missing')


def export_db():
    if Path('/etc/hostname').read_text().strip() != 't3-prod-db':
        raise RuntimeError('Expected prod DB host')
    data = {name: read_env(path, key) for name, path, key in [
        ('user', '/opt/mysql/.env', 'MYSQL_PASSWORD'),
        ('file', '/opt/mysql/file_service.env', 'FILE_SERVICE_PASSWORD'),
        ('mongo', '/opt/mongodb/.env', 'CHAT_PASSWORD'),
        ('redis', '/opt/redis/.env', 'REDIS_PASSWORD'),
    ]}
    if sys.stdout.isatty():
        raise RuntimeError('Refusing to display credentials in terminal')
    sys.stdout.write(json.dumps(data))


def manifests(data, storage):
    common = {'OIDC_ISSUER_URI': ISSUER}
    redis = {'REDIS_URL': 'redis://10.10.24.20:6379', 'REDIS_PASSWORD': data['redis']}
    values = {
        'user-service-env': {**common, **redis,
            'DB_URL': 'jdbc:mysql://10.10.24.20:3306/user_service',
            'DB_USERNAME': 'user_service', 'DB_PASSWORD': data['user'],
            'INVITE_BASE_URL': 'https://ideaconnection.jpexstudio.com'},
        'file-service-env': {**common,
            'DB_URL': 'jdbc:mysql://10.10.24.20:3306/file_service',
            'DB_USERNAME': 'file_service', 'DB_PASSWORD': data['file'],
            'USER_SERVICE_URL': 'http://user-service',
            'S3_ENDPOINT': 'http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333',
            'S3_PUBLIC_ENDPOINT': 'https://ideaconnection.jpexstudio.com',
            'S3_REGION': 'us-east-1', 'S3_BUCKET': 'chat-attachments',
            'S3_ACCESS_KEY': storage['AWS_ACCESS_KEY_ID'],
            'S3_SECRET_KEY': storage['AWS_SECRET_ACCESS_KEY']},
        'chat-service-env': {**common, **redis,
            'DB_URL': 'mongodb://10.10.24.20:27017/chat_service?authSource=chat_service',
            'DB_USERNAME': 'chat_service', 'DB_PASSWORD': data['mongo']},
    }
    return [{'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
             'metadata': {'name': name, 'namespace': NS}, 'stringData': value}
            for name, value in values.items()]


def register():
    nodes = kube(['get', 'nodes', '-o', 'json'])
    addresses = {a['address'] for n in nodes['items'] for a in n['status'].get('addresses', [])
                 if a['type'] == 'InternalIP'}
    if addresses != {'10.10.24.21', '10.10.24.22', '10.10.24.23'}:
        raise RuntimeError('Expected prod cluster')
    kube(['get', 'namespace', NS, '-o', 'json'])
    payload = sys.stdin.read(16385)
    if len(payload) > 16384:
        raise RuntimeError('Credential input too large')
    data = json.loads(payload)
    if set(data) != {'user', 'file', 'mongo', 'redis'} or not all(
            isinstance(v, str) and v and v.isalnum() for v in data.values()):
        raise RuntimeError('Unexpected credential structure')
    raw = kube(['get', 'secret', 'seaweedfs-s3-auth', '-n', 'seaweedfs', '-o', 'json'])
    storage = {k: base64.b64decode(raw['data'][k]).decode()
               for k in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']}
    items = manifests(data, storage)
    for item in items:
        if kube(['get', 'secret', item['metadata']['name'], '-n', NS,
                 '--ignore-not-found', '-o', 'json']):
            raise RuntimeError('A service Secret already exists; refusing to overwrite')
    for item in items:
        kube(['create', '-f', '-', '-o', 'json'], json.dumps(item))
        print('prod: secret/' + item['metadata']['name'] + ' created; credentials not displayed')


def main():
    if sys.argv[1:] == ['export-db']:
        export_db()
    elif sys.argv[1:] == ['register']:
        register()
    elif sys.argv[1:] == ['--check']:
        items = manifests(dict.fromkeys(['user', 'file', 'mongo', 'redis'], 'example'),
                          {'AWS_ACCESS_KEY_ID': 'example', 'AWS_SECRET_ACCESS_KEY': 'example'})
        assert [len(i['stringData']) for i in items] == [7, 11, 6]
        assert all(i['metadata']['namespace'] == NS for i in items)
        print('Service Secret structure check passed; no credentials displayed')
    else:
        raise RuntimeError('Expected export-db, register or --check')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Secret preparation stopped. Credential details withheld; check host, files and existing Secret names. No existing Secret was overwritten.', file=sys.stderr)
        sys.exit(1)
