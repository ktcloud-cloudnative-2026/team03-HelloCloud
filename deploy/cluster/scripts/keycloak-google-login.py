#!/usr/bin/env python3
"""Turn on Google sign-up/login for the existing Keycloak realm (#223). Safe to re-run.

Run on your own PC (needs python3 and SSH to the prod cp). The Google OAuth client JSON is
read from a local file and the Keycloak admin password from a prompt; both go to the
Keycloak pod over stdin only, never as arguments, output, or files.

  prod:  python3 keycloak-google-login.py --google-json client_secret.json --ssh t4-prod-cp
  local: python3 keycloak-google-login.py --google-json client_secret.json --docker <container>

What it sets (realm hellocloud):
  - sign-up by email (Keycloak form) or Google; password login stays
  - identity provider "google" (trust email, scopes openid email profile)
  - Google "name" claim -> user attribute displayName (refreshed every login), admin-only attribute
  - hellocloud-web mapper: displayName -> token claim display_name (services read it before name)
  - first broker login: no "review profile" page
"""
import argparse
import getpass
import json
import shlex
import subprocess
import sys

KCADM = '/opt/keycloak/bin/kcadm.sh'
CONFIG = '/tmp/kcadm-google-login.config'
REALM = 'hellocloud'
WEB_CLIENT = 'hellocloud-web'


class Keycloak:
    def __init__(self, args):
        self.args = args

    def _command(self, inner):
        if self.args.docker:
            return ['docker', 'exec', '-i', self.args.docker, *inner]
        kubectl = ['kubectl', 'exec', '-i', '-n', self.args.namespace, 'deploy/keycloak', '--', *inner]
        return ['ssh', self.args.ssh, shlex.join(kubectl)]

    def run(self, inner, payload=None):
        result = subprocess.run(self._command(inner), input=payload, capture_output=True, text=True)
        if result.returncode:
            # kcadm 오류 문구에는 시크릿이 들어가지 않는다. 입력(payload)은 출력하지 않는다
            raise RuntimeError(f'failed: {" ".join(inner[:3])} ...\n{result.stderr.strip()[:500]}')
        return result.stdout

    def kc(self, *args, payload=None):
        return self.run([KCADM, *args, '--config', CONFIG], payload)

    def get(self, path):
        return json.loads(self.kc('get', path, '-r', REALM))

    def login(self, user, password):
        script = (f'IFS= read -r P; exec {KCADM} config credentials --config {CONFIG} '
                  '--server http://localhost:8080 --realm master --user "$1" --password "$P"')
        self.run(['bash', '-c', script, '_', user], password + '\n')

    def logout(self):
        self.run(['rm', '-f', CONFIG])


def google_client(path):
    with open(path, encoding='utf-8') as f:
        web = json.load(f).get('web') or {}
    if not web.get('client_id', '').endswith('.apps.googleusercontent.com') or not web.get('client_secret'):
        raise RuntimeError('Not a Google OAuth web client JSON (needs web.client_id and web.client_secret)')
    return web['client_id'], web['client_secret']


def apply(kc, client_id, client_secret):
    kc.kc('update', f'realms/{REALM}', '-s', 'registrationAllowed=true')
    print('- email sign-up: on (with Google sign-up)')

    profile = kc.get('users/profile')
    if not any(a['name'] == 'displayName' for a in profile['attributes']):
        profile['attributes'].append({
            'name': 'displayName', 'displayName': 'Display name', 'multivalued': False,
            'permissions': {'view': ['admin'], 'edit': ['admin']},
            'validations': {'length': {'max': 100}},
        })
        kc.kc('update', 'users/profile', '-r', REALM, '-f', '-', payload=json.dumps(profile))
    print('- user profile attribute displayName: present (admin only)')

    idp = {
        'alias': 'google', 'providerId': 'google', 'enabled': True, 'trustEmail': True,
        'config': {'clientId': client_id, 'clientSecret': client_secret,
                   'defaultScope': 'openid email profile', 'syncMode': 'IMPORT'},
    }
    existing = [i['alias'] for i in json.loads(kc.kc('get', 'identity-provider/instances', '-r', REALM))]
    if 'google' in existing:
        kc.kc('update', 'identity-provider/instances/google', '-r', REALM, '-f', '-', payload=json.dumps(idp))
    else:
        kc.kc('create', 'identity-provider/instances', '-r', REALM, '-f', '-', payload=json.dumps(idp))
    print('- identity provider google: enabled')

    mappers = [m['name'] for m in kc.get('identity-provider/instances/google/mappers')]
    if 'google-full-name' not in mappers:
        kc.kc('create', 'identity-provider/instances/google/mappers', '-r', REALM, '-f', '-', payload=json.dumps({
            'name': 'google-full-name', 'identityProviderAlias': 'google',
            'identityProviderMapper': 'oidc-user-attribute-idp-mapper',
            'config': {'syncMode': 'FORCE', 'claim': 'name', 'user.attribute': 'displayName'},
        }))
    print('- google name -> displayName: present')

    executions = kc.get('authentication/flows/first%20broker%20login/executions')
    review = next(e for e in executions if e.get('providerId') == 'idp-review-profile')
    config_id = review['authenticationConfig']
    review_config = kc.get(f'authentication/config/{config_id}')
    review_config['config']['update.profile.on.first.login'] = 'off'
    kc.kc('update', f'authentication/config/{config_id}', '-r', REALM, '-f', '-', payload=json.dumps(review_config))
    print('- first login review profile: off')

    clients = json.loads(kc.kc('get', 'clients', '-r', REALM, '-q', f'clientId={WEB_CLIENT}'))
    web_id = clients[0]['id']
    models = kc.get(f'clients/{web_id}/protocol-mappers/models')
    if not any(m['name'] == 'display-name' for m in models):
        kc.kc('create', f'clients/{web_id}/protocol-mappers/models', '-r', REALM, '-f', '-', payload=json.dumps({
            'name': 'display-name', 'protocol': 'openid-connect',
            'protocolMapper': 'oidc-usermodel-attribute-mapper',
            'config': {'user.attribute': 'displayName', 'claim.name': 'display_name', 'jsonType.label': 'String',
                       'id.token.claim': 'true', 'access.token.claim': 'true',
                       'userinfo.token.claim': 'true', 'introspection.token.claim': 'true'},
        }))
    print(f'- {WEB_CLIENT} displayName -> display_name: present')


def verify(kc):
    realm = kc.get(f'realms/{REALM}')
    idp = kc.get('identity-provider/instances/google')
    executions = kc.get('authentication/flows/first%20broker%20login/executions')
    review_id = next(e for e in executions if e.get('providerId') == 'idp-review-profile')['authenticationConfig']
    review = kc.get(f'authentication/config/{review_id}')['config']
    web_id = json.loads(kc.kc('get', 'clients', '-r', REALM, '-q', f'clientId={WEB_CLIENT}'))[0]['id']
    checks = {
        'registrationAllowed is true': realm.get('registrationAllowed') is True,
        'google enabled, trustEmail': idp.get('enabled') and idp.get('trustEmail'),
        'google client secret set': bool(idp['config'].get('clientSecret')),
        'review profile off': review.get('update.profile.on.first.login') == 'off',
        'display_name mapper': any(m['name'] == 'display-name'
                                   for m in kc.get(f'clients/{web_id}/protocol-mappers/models')),
    }
    for name, ok in checks.items():
        print(f'  [{"ok" if ok else "FAIL"}] {name}')
    return all(checks.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--google-json', required=True, help='Google OAuth web client JSON (downloaded file)')
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument('--ssh', help='SSH host of the cp that runs kubectl (prod)')
    target.add_argument('--docker', help='local Keycloak container name (test)')
    parser.add_argument('--namespace', default='ideaconnection-prod')
    parser.add_argument('--admin-user', default='admin', help='master realm admin user')
    args = parser.parse_args()

    client_id, client_secret = google_client(args.google_json)
    password = getpass.getpass(f'Keycloak master admin password ({args.admin_user}): ')
    kc = Keycloak(args)
    kc.login(args.admin_user, password)
    try:
        apply(kc, client_id, client_secret)
        print('verify:')
        ok = verify(kc)
    finally:
        kc.logout()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, StopIteration, KeyError) as error:
        sys.exit(f'error: {error}')
