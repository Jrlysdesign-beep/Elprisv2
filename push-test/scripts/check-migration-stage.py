#!/usr/bin/env python3
"""Fail-closed verification of D1 migration stages. Reads Wrangler --json output only."""
import json,sys
STAGES={"before":(0,0,0,0),"001":(4,0,0,0),"002":(5,1,0,0),"003":(5,1,1,1)}
def check(raw,stage):
 if stage not in STAGES: raise ValueError("Unknown migration stage")
 payload=json.loads(raw)
 if not isinstance(payload,list) or len(payload)!=1: raise ValueError("Unexpected Wrangler response")
 item=payload[0]
 if item.get("success") is not True or not isinstance(item.get("results"),list) or len(item["results"])!=1:
  raise ValueError("Wrangler query failed or returned unexpected rows")
 row=item["results"][0]
 expected=STAGES[stage]
 values=tuple(row.get(k) for k in ("delivery_columns","overlap_index","rate_table","rate_index"))
 if any(type(v) is not int for v in values) or values!=expected or row.get("base_tables")!=3:
  raise ValueError(f"Schema mismatch at stage {stage}; stop and investigate")
 return True
if __name__=="__main__":
 try:
  check(sys.stdin.read(),sys.argv[1])
  print("Schema stage verified:",sys.argv[1])
 except (ValueError,KeyError,IndexError) as e:
  print("STOP: unexpected or partially migrated schema:",e,file=sys.stderr)
  sys.exit(1)
