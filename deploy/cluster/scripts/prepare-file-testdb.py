#!/usr/bin/env python3
"""Run on the control-plane after SSH access to the DB VM is configured.

Creates testdb, falling back to seaweedtestdb when the preferred name is occupied. Never prints or writes credentials.
Credentials are retained in the Secret if DB provisioning fails, permitting a retry.
"""
import argparse
import base64
import json
import secrets
import shlex
import subprocess
import sys

NAMESPACE = 'ideaconnection-dev'
SECRET = 'file-service-env'
OWNER = 'hellocloud-file-testdb'
DB_BASE = 'jdbc:mysql://10.10.24.10:3306/'
DB_NAMES = ('testdb', 'seaweedtestdb')


def choose_name(state):
    for name in DB_NAMES:
        if not state[name]['databaseExists'] and not state[name]['accountExists']:
            return name
    raise RuntimeError('Both testdb and seaweedtestdb are occupied; refusing to overwrite')

REMOTE = r'''
import json, subprocess, sys
payload = json.load(sys.stdin)
containers = subprocess.run(['docker', 'ps', '--format', '{{.ID}} {{.Image}}'], capture_output=True, text=True, check=True).stdout.splitlines()
containers = [line.split()[0] for line in containers if line.split()[1].startswith('mysql:')]
if len(containers) != 1:
    raise SystemExit('Expected exactly one MySQL container')
container = containers[0]
def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', container, 'sh', '-c',
      'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --protocol=socket -u root --batch --skip-column-names'],
      input=statement, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit('MySQL administrator command failed; credentials were not printed')
    return result.stdout.strip()
if payload['mode'] == 'preflight':
    state = {}
    for name in ('testdb', 'seaweedtestdb'):
        existing = sql("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + name + "'; SELECT COUNT(*) FROM mysql.user WHERE User='" + name + "';").splitlines()
        state[name] = {'databaseExists': existing[0] != '0', 'accountExists': existing[1] != '0'}
    print(json.dumps(state))
else:
    name = payload['name']
    if name not in ('testdb', 'seaweedtestdb'):
        raise SystemExit('Unexpected database name')
    password = payload['password']
    if not password or not all(c.isalnum() or c in '_-' for c in password):
        raise SystemExit('Invalid generated password')
    sql("CREATE DATABASE IF NOT EXISTS `" + name + "` CHARACTER SET utf8mb4; "
        "CREATE USER IF NOT EXISTS '" + name + "'@'%' IDENTIFIED BY '" + password + "'; "
        "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON `" + name + "`.* TO '" + name + "'@'%';")
    check = subprocess.run(['docker', 'exec', '-i', container, 'sh', '-c',
      'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql --protocol=socket -u ' + name + ' ' + name + ' --batch --skip-column-names'],
      input=password + '\nSELECT 1;\n', capture_output=True, text=True)
    if check.returncode or check.stdout.strip() != '1':
        raise SystemExit('Database login verification failed; no existing password was changed')
    print(name + ' database/account/login ready')
'''


def kubectl(*args, payload=None):
    result = subprocess.run(['kubectl', *args], input=payload, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Kubernetes operation failed; credentials were not printed')
    return json.loads(result.stdout) if result.stdout.strip() else None


def data(secret):
    return {key: base64.b64decode(value).decode() for key, value in secret['data'].items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh-target', default='lab@10.10.24.10')
    parser.add_argument('--known-hosts', help='Verified SSH known_hosts file')
    parser.add_argument('--check', action='store_true', help='Read-only preflight')
    args = parser.parse_args()
    ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=yes']
    if args.known_hosts:
        ssh += ['-o', 'UserKnownHostsFile=' + args.known_hosts]
    ssh += [args.ssh_target, 'python3 -c ' + shlex.quote(REMOTE)]

    def remote(payload):
        result = subprocess.run(ssh, input=json.dumps(payload), capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('DB SSH/admin operation failed; check SSH authentication and Docker access')
        return result.stdout

    state = json.loads(remote({'mode': 'preflight'}))
    current = kubectl('get', 'secret', SECRET, '-n', NAMESPACE, '--ignore-not-found', '-o', 'json')
    owned = current and current['metadata'].get('labels', {}).get('app.kubernetes.io/managed-by') == OWNER
    if current and not owned:
        raise RuntimeError('Existing file-service-env is not owned by this setup; refusing to overwrite')
    if owned:
        saved = data(current)
        name = saved.get('DB_USERNAME')
        if name not in DB_NAMES or saved.get('DB_URL') != DB_BASE + name:
            raise RuntimeError('Existing setup Secret has unexpected DB settings')
    else:
        name = choose_name(state)
    if args.check:
        print('SSH/admin preflight passed; selected database/account: ' + name + '; no changes made')
        return
    if not current:
        user = data(kubectl('get', 'secret', 'user-service-env', '-n', NAMESPACE, '-o', 'json'))
        storage = data(kubectl('get', 'secret', 'seaweedfs-s3-auth', '-n', 'seaweedfs', '-o', 'json'))
        values = {
            'DB_URL': DB_BASE + name, 'DB_USERNAME': name, 'DB_PASSWORD': secrets.token_urlsafe(32),
            'OIDC_ISSUER_URI': user['OIDC_ISSUER_URI'], 'USER_SERVICE_URL': 'http://user-service',
            'S3_ENDPOINT': 'http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333',
            'S3_PUBLIC_ENDPOINT': 'http://10.10.24.101', 'S3_REGION': 'us-east-1',
            'S3_BUCKET': 'chat-attachments', 'S3_ACCESS_KEY': storage['AWS_ACCESS_KEY_ID'],
            'S3_SECRET_KEY': storage['AWS_SECRET_ACCESS_KEY'],
        }
        obj = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {
            'name': SECRET, 'namespace': NAMESPACE,
            'labels': {'app.kubernetes.io/managed-by': OWNER}}, 'type': 'Opaque', 'stringData': values}
        kubectl('create', '-f', '-', '-o', 'json', payload=json.dumps(obj))
    else:
        values = data(current)
        if values.get('DB_URL') != DB_BASE + name or values.get('DB_USERNAME') != name:
            raise RuntimeError('Existing setup Secret has unexpected DB settings')
    remote({'mode': 'provision', 'name': name, 'password': values['DB_PASSWORD']})
    print('Created/verified ' + name + ' DB/account and file-service-env; credentials not displayed')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Setup failed; credentials were not printed', file=sys.stderr)
        sys.exit(1)
