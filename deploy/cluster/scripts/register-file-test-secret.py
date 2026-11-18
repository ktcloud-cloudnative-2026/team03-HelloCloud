#!/usr/bin/env python3
"""Read seaweedtest password from stdin, verify DB login, create file-service-env.

Run on dev-cp. Password is sent from the DB VM over SSH; no credential output/files.
Requires PyMySQL 1.1.2 with cryptography for MySQL caching_sha2_password authentication.
"""
import base64
import json
import subprocess
import sys


def kube(*args, payload=None):
    result = subprocess.run(['kubectl', *args], input=payload, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Kubernetes operation failed; credentials were not printed')
    return json.loads(result.stdout) if result.stdout.strip() else None


def decode(secret):
    return {key: base64.b64decode(value).decode() for key, value in secret['data'].items()}


def main():
    import pymysql

    password = sys.stdin.read(4097).rstrip('\r\n')
    if not password or len(password) > 4096 or '\n' in password or '\r' in password:
        raise RuntimeError('Expected one non-empty password line on stdin')
    connection = pymysql.connect(
        host='10.10.24.10', port=3306, user='seaweedtest', password=password,
        database='seaweedtest', connect_timeout=5, read_timeout=5,
    )
    with connection:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            if cursor.fetchone() != (1,):
                raise RuntimeError('Database login verification failed')
    namespace = 'ideaconnection-dev'
    existing = kube('get', 'secret', 'file-service-env', '-n', namespace,
                    '--ignore-not-found', '-o', 'json')
    if existing:
        current = decode(existing)
        if (current.get('DB_USERNAME') != 'seaweedtest' or current.get('DB_PASSWORD') != password
                or current.get('DB_URL') != 'jdbc:mysql://10.10.24.10:3306/seaweedtest'
                or not all(current.get(key) for key in ('OIDC_ISSUER_URI', 'USER_SERVICE_URL',
                    'S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT', 'S3_REGION', 'S3_BUCKET',
                    'S3_ACCESS_KEY', 'S3_SECRET_KEY'))):
            raise RuntimeError('Existing file-service-env differs; refusing to overwrite')
        print('seaweedtest login verified; matching file-service-env already exists')
        return
    user = decode(kube('get', 'secret', 'user-service-env', '-n', namespace, '-o', 'json'))
    storage = decode(kube('get', 'secret', 'seaweedfs-s3-auth', '-n', 'seaweedfs', '-o', 'json'))
    values = {
        'DB_URL': 'jdbc:mysql://10.10.24.10:3306/seaweedtest',
        'DB_USERNAME': 'seaweedtest', 'DB_PASSWORD': password,
        'OIDC_ISSUER_URI': user['OIDC_ISSUER_URI'],
        'USER_SERVICE_URL': 'http://user-service',
        'S3_ENDPOINT': 'http://seaweedfs-s3.seaweedfs.svc.cluster.local:8333',
        'S3_PUBLIC_ENDPOINT': 'http://10.10.24.101',
        'S3_REGION': 'us-east-1', 'S3_BUCKET': 'chat-attachments',
        'S3_ACCESS_KEY': storage['AWS_ACCESS_KEY_ID'],
        'S3_SECRET_KEY': storage['AWS_SECRET_ACCESS_KEY'],
    }
    kube('create', '-f', '-', '-o', 'json', payload=json.dumps({
        'apiVersion': 'v1', 'kind': 'Secret', 'type': 'Opaque',
        'metadata': {'name': 'file-service-env', 'namespace': namespace},
        'stringData': values,
    }))
    print('seaweedtest login verified; secret/file-service-env created; credentials not displayed')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError)
              else 'Secret registration failed (' + type(error).__name__ + '); credentials were not printed',
              file=sys.stderr)
        sys.exit(1)
