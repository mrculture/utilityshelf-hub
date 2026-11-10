const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {query}=require('../../analytics/build-queries.cjs');
const {events}=require('../../analytics/known-tests.json');
test('filtered reports exclude known signatures and samples while preserving nearby visitor actions',()=>{
 const db=new DatabaseSync(':memory:');
 db.function('toDateTime',(value,zone)=>{assert.equal(zone,'UTC');return value;});
 db.exec('CREATE TABLE utilityshelf_tool_usage(timestamp TEXT,index1 TEXT,blob1 TEXT,blob2 TEXT,blob3 TEXT,double1 REAL,_sample_interval INTEGER)');
 const insert=db.prepare('INSERT INTO utilityshelf_tool_usage VALUES(?,?,?,?,?,?,?)');
 const write=(e,w=1)=>insert.run(e.timestamp,e.index1,e.blob1,e.blob2,e.blob3,1,w);
 for(const event of events)write(event);
 write({...events[0],blob3:'sample'});
 write({...events[0],timestamp:'2026-11-10 14:48:05'},2);
 write({...events[0],blob1:'reorder'});
 for(const summary of [false,true]) {
  const sql=query(7,summary);
  assert.equal(fs.readFileSync(path.resolve(__dirname,'../../analytics',summary?'visitor-total.sql':'visitor-usage.sql'),'utf8'),sql);
  // Adapt only the rolling-window syntax; execute the exclusion predicate unchanged.
  const rows=db.prepare(sql.replace("NOW() - INTERVAL '7' DAY","'2026-11-03 00:00:00'")).all();
  const count=summary?rows[0].filtered_custom_events:rows.reduce((n,row)=>n+row.events,0);
  assert.equal(count,3);
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM utilityshelf_tool_usage').get().n,9);
 db.close();
});
