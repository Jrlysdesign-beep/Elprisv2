import pathlib,sys,unittest,json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
import importlib.util
path=pathlib.Path(__file__).resolve().parents[1]/"scripts/check-migration-stage.py"
spec=importlib.util.spec_from_file_location("stage",path)
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
def payload(values):
 return json.dumps([{"success":True,"results":[dict(zip(("base_tables","delivery_columns","overlap_index","rate_table","rate_index"),(3,*values)))]}])
class Tests(unittest.TestCase):
 def test_all_stages(self):
  for name,values in stage.STAGES.items():
   self.assertTrue(stage.check(payload(values),name))
 def test_partial_migrations_rejected(self):
  for name in stage.STAGES:
   for values in [(1,0,0,0),(4,1,0,0),(5,0,0,0),(5,1,1,0),(5,1,0,1)]:
    if values!=stage.STAGES[name]:
     with self.assertRaises(ValueError):stage.check(payload(values),name)
 def test_fail_closed(self):
  for bad in ["[]","{}","not json",json.dumps([{"success":False,"results":[]}]),json.dumps([{"success":True,"results":[{"base_tables":3}]}])]:
   with self.assertRaises((ValueError,KeyError)):stage.check(bad,"before")
if __name__=="__main__":unittest.main()
