#!/usr/bin/env python3
"""Exercise the REAL shell verifier with a fake npx. No network or Cloudflare."""
import json,os,pathlib,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
STAGES={"before":(0,0,0,0),"001":(4,0,0,0),"002":(5,1,0,0),"003":(5,1,1,1)}
KEYS=("base_tables","delivery_columns","overlap_index","rate_table","rate_index")
def response(values,base=3):
 return json.dumps([{"success":True,"results":[dict(zip(KEYS,(base,*values)))]}])
def run(stage,payload,db="elpris-push-isolated-test-db",fail=False):
 with tempfile.TemporaryDirectory(prefix="fake-wrangler-") as temp:
  folder=pathlib.Path(temp)
  fake=folder/"npx"
  fake.write_text("#!/bin/sh\n" +
   "case \"$*\" in\n" +
   "  *\"wrangler d1 execute elpris-push-isolated-test-db --remote --config wrangler.jsonc --json --command SELECT\"*) ;;\n" +
   "  *) exit 88 ;;\n" +
   "esac\n" +
   "if [ \"$FAKE_FAIL\" = 1 ]; then exit 89; fi\n" +
   "printf '%s' \"$FAKE_RESPONSE\"\n")
  fake.chmod(0o700)
  env={**os.environ,"PATH":str(folder)+os.pathsep+os.environ["PATH"],"DB_NAME":db,
       "FAKE_RESPONSE":payload,"FAKE_FAIL":"1" if fail else "0"}
  return subprocess.run(["bash","scripts/verify-remote-migration-stage.sh",stage],
   cwd=ROOT,env=env,capture_output=True,text=True,timeout=8)
count=0
for name,expected in STAGES.items():
 result=run(name,response(expected))
 assert result.returncode==0,(name,result.stderr,result.stdout)
 count+=1
 for wrong in STAGES.values():
  if wrong==expected:continue
  result=run(name,response(wrong))
  assert result.returncode!=0,(name,wrong)
  count+=1
for wrong in [(1,0,0,0),(4,1,0,0),(5,0,0,0),(5,1,1,0),(5,1,0,1)]:
 for name in STAGES:
  if wrong==STAGES[name]:continue
  assert run(name,response(wrong)).returncode!=0
  count+=1
for bad in ["[]","{}","not json",json.dumps([{"success":False,"results":[]}]),response((0,0,0,0),2)]:
 assert run("before",bad).returncode!=0
 count+=1
assert run("before",response(STAGES["before"]),db="wrong-database").returncode!=0
count+=1
assert run("before",response(STAGES["before"]),fail=True).returncode!=0
count+=1
assert run("unexpected",response(STAGES["before"])).returncode!=0
count+=1
print(f"PASS: {count} offline shell integration cases; no real Wrangler or Cloudflare access")
