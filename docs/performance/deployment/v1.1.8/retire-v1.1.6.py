import json
import subprocess

prefix = 'ghcr.io/battlecity-remastered/battlecity-remastered:'
current, previous, obsolete = [prefix + version for version in ['v1.1.8', 'v1.1.7', 'v1.1.6']]


def inspect(kind, reference):
    return json.loads(subprocess.check_output(['docker', kind, 'inspect', reference]))[0]


running = inspect('container', 'battlecity-server')
assert running['Config']['Image'] == current
assert inspect('image', current)['Config']['Labels']['org.opencontainers.image.revision'] == 'ea166c49cf9c2b1f1be680f6d284cf5606c77a4c'
rollback = inspect('image', previous)
assert rollback['Id'] == 'sha256:faac1beb6d12e376de7a01a5c2c536eade166e7f1e0ff9b2d213f8a9a0fc594b'
candidate = inspect('image', obsolete)
assert candidate['Id'] not in [running['Image'], rollback['Id']]
containers = subprocess.check_output(['docker', 'ps', '-aq']).decode().split()
assert all(inspect('container', container)['Image'] != candidate['Id'] for container in containers)
# Preserve an auditable registry recovery manifest before deleting the local tag.
manifest = json.loads(subprocess.check_output(['docker', 'manifest', 'inspect', obsolete]))
assert manifest['manifests']
print(json.dumps({'recoverable': obsolete, 'manifest': manifest}), flush=True)
subprocess.run(['docker', 'image', 'rm', obsolete], check=True)
assert inspect('image', current)['Id'] == running['Image']
assert inspect('image', previous)['Id'] == rollback['Id']
subprocess.run(['df', '-h', '/'], check=True)
print(json.dumps({'removed': obsolete, 'running_retained': current, 'rollback_retained': previous}), flush=True)
