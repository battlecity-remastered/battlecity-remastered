import json, os, pathlib, shutil, sqlite3, subprocess, time, urllib.request

root=pathlib.Path('/home/ubuntu/battlecity-backups/20261003-v1-1-7')
root.mkdir(parents=True,mode=0o700,exist_ok=False)
compose=pathlib.Path('/home/ubuntu/battlecity-js-remake/docker-compose.yml')
previous='ghcr.io/battlecity-remastered/battlecity-remastered:v1.1.6'
release='ghcr.io/battlecity-remastered/battlecity-remastered:v1.1.7'
text=compose.read_text()
assert text.count('image: '+previous)==1
image=json.loads(subprocess.check_output(['docker','image','inspect',release]))[0]
assert image['Config']['Labels']['org.opencontainers.image.revision']=='9c5be7b098584d95c3576e8089f62aea9af41eac'
container_before=json.loads(subprocess.check_output(['docker','inspect','battlecity-server']))[0]
assert container_before['Config']['Image']==previous
mount_before=[m for m in container_before['Mounts'] if m['Destination']=='/app/server/data'][0]
assert mount_before['Name']=='battlecity-js-remake_battlecity_data'
subprocess.run(['docker','image','inspect',previous],check=True,stdout=subprocess.DEVNULL)
shutil.copy2(compose,root/'docker-compose.original.yml')
rollback=text.replace('pull_policy: always','pull_policy: never')
(root/'docker-compose.rollback.yml').write_text(rollback)
rollback_script='#!/bin/sh\nset -eu\ncd /home/ubuntu/battlecity-js-remake\nsudo cp '+str(root/'docker-compose.rollback.yml')+' docker-compose.yml\nsudo docker compose --project-name battlecity-js-remake up -d --no-deps --force-recreate battlecity\n'
(root/'rollback.sh').write_text(rollback_script)
(root/'rollback.sh').chmod(0o700)
data=pathlib.Path('/var/lib/docker/volumes/battlecity-js-remake_battlecity_data/_data')
with sqlite3.connect('file:'+str(data/'scores.db')+'?mode=ro',uri=True) as source:
    with sqlite3.connect(root/'scores-before-v1-1-7.db') as dest:
        source.backup(dest)
        assert dest.execute('pragma integrity_check').fetchone()[0]=='ok'
pending=compose.with_name('docker-compose.pending.yml')
pending.write_text(text.replace('image: '+previous,'image: '+release))
pending.chmod(0o600)
resolved=json.loads(subprocess.check_output(['docker','compose','--project-name','battlecity-js-remake','-f',str(pending),'config','--format','json']))
service=resolved['services']['battlecity']
assert service['image']==release and str(service['environment']['PORT'])=='8021'
assert service['environment']['BATTLECITY_SCORES_DB_PATH']=='/app/server/data/scores.db'
pending.replace(compose)
try:
    subprocess.run(['docker','compose','--project-name','battlecity-js-remake','-f',str(compose),'up','-d','--no-deps','--force-recreate','battlecity'],check=True)
    for attempt in range(45):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8021/health',timeout=2) as response:
                assert json.load(response)=={'ok':True,'service':'server-ts'}
            break
        except Exception: time.sleep(1)
    else: raise RuntimeError('Forward fix did not become healthy')
    container_after=json.loads(subprocess.check_output(['docker','inspect','battlecity-server']))[0]
    assert container_after['Config']['Image']==release
    mount_after=[m for m in container_after['Mounts'] if m['Destination']=='/app/server/data'][0]
    assert mount_after['Name']==mount_before['Name'] and mount_after['Source']==mount_before['Source']
    with sqlite3.connect(root/'scores-before-v1-1-7.db') as old:
        with sqlite3.connect('file:'+str(data/'scores.db')+'?mode=ro',uri=True) as new:
            assert new.execute('pragma integrity_check').fetchone()[0]=='ok'
            counts={}
            for table in ['users','player_scores']:
                columns=[row[1] for row in old.execute('pragma table_info('+table+')')]
                selection=','.join('"'+column+'"' for column in columns)
                assert set(old.execute('select '+selection+' from '+table)).issubset(set(new.execute('select '+selection+' from '+table)))
                counts[table]=new.execute('select count(*) from '+table).fetchone()[0]
    print(json.dumps({'deployed':release,'database_integrity':'ok','existing_records_preserved':counts,'rollback':str(root/'rollback.sh'),'revision':image['Config']['Labels']['org.opencontainers.image.revision'],'image_digest':image['RepoDigests'],'volume':mount_before['Name']}))
except Exception:
    subprocess.run(['sh',str(root/'rollback.sh')],check=True)
    raise
