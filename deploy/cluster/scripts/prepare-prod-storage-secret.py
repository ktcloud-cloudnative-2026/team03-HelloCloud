#!/usr/bin/env python3
"""Create isolated prod S3 credentials in memory; never print credential payloads."""
import json
import secrets
import subprocess
import sys


def run(args, payload=None):
    result = subprocess.run(['kubectl', *args], input=payload, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('kubectl failed; credential payload and command output withheld')
    return json.loads(result.stdout) if result.stdout.strip() else None


def manifest():
    app = {'accessKey': secrets.token_hex(16), 'secretKey': secrets.token_hex(32)}
    admin = {'accessKey': secrets.token_hex(16), 'secretKey': secrets.token_hex(32)}
    config = {'identities': [
        {'name': 'prod-storage-admin', 'credentials': [admin],
         'actions': ['Admin', 'Read', 'Write', 'List', 'Tagging']},
        {'name': 'file-service', 'credentials': [app],
         'actions': ['Read:chat-attachments', 'Write:chat-attachments',
                     'List:chat-attachments', 'Tagging:chat-attachments']},
    ]}
    return {'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
            'metadata': {'name': 'seaweedfs-s3-auth', 'namespace': 'seaweedfs'},
            'stringData': {'seaweedfs_s3_config': json.dumps(config),
                           'AWS_ACCESS_KEY_ID': app['accessKey'],
                           'AWS_SECRET_ACCESS_KEY': app['secretKey'],
                           'ADMIN_ACCESS_KEY_ID': admin['accessKey'],
                           'ADMIN_SECRET_ACCESS_KEY': admin['secretKey']}}


def main():
    if sys.argv[1:] == ['--check']:
        item = manifest()
        assert set(item['stringData']) == {'seaweedfs_s3_config', 'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY', 'ADMIN_ACCESS_KEY_ID', 'ADMIN_SECRET_ACCESS_KEY'}
        config = json.loads(item['stringData']['seaweedfs_s3_config'])
        assert len(config['identities']) == 2
        assert 'Admin' not in config['identities'][1]['actions']
        print('Credential structure check passed; no credentials displayed')
        return
    if sys.argv[1:]:
        raise RuntimeError('Usage: prepare-prod-storage-secret.py [--check]')
    nodes = run(['get', 'nodes', '-o', 'json'])
    addresses = {address['address'] for node in nodes['items']
                 for address in node['status'].get('addresses', [])
                 if address['type'] == 'InternalIP'}
    if addresses != {'10.10.24.21', '10.10.24.22', '10.10.24.23'}:
        raise RuntimeError('Expected prod node addresses; no changes made')
    run(['get', 'namespace', 'ideaconnection-prod', '-o', 'json'])
    existing = run(['get', 'secret', 'seaweedfs-s3-auth', '-n', 'seaweedfs',
                    '--ignore-not-found', '-o', 'json']) if run([
                        'get', 'namespace', 'seaweedfs', '--ignore-not-found', '-o', 'json']) else None
    if existing:
        raise RuntimeError('Storage Secret already exists; refusing to overwrite')
    if not run(['get', 'namespace', 'seaweedfs', '--ignore-not-found', '-o', 'json']):
        run(['create', 'namespace', 'seaweedfs', '-o', 'json'])
    run(['create', '-f', '-', '-o', 'json'], json.dumps(manifest()))
    print('prod: seaweedfs/seaweedfs-s3-auth created; credentials not displayed')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Preparation stopped; no existing Secret was overwritten. Check prod context, namespace and Secret existence.', file=sys.stderr)
        sys.exit(1)
