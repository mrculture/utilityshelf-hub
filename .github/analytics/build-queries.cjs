const fs = require('node:fs');
const path = require('node:path');
const {events} = require('./known-tests.json');
const fields = ['timestamp','index1','blob1','blob2','blob3'];
function filters(days=7) {
 if (!Number.isInteger(days) || days<1 || days>90) throw Error('Use a whole reporting window of 1–90 days');
 const quote = value => { if(typeof value!=='string' || !/^[a-zA-Z0-9_: -]+$/.test(value)) throw Error('Invalid exclusion label'); return "'"+value+"'"; };
 const known = events.map(row=>'('+fields.map(key=>key+' = '+(key==='timestamp'?'toDateTime('+quote(row[key]) + ", 'UTC')":quote(row[key]))).join(' AND ')+')').join('\n    OR ');
 return "timestamp >= NOW() - INTERVAL '"+days+"' DAY\n  AND blob3 = 'custom'\n  AND NOT (\n    "+known+'\n  )';
}
function query(days=7,summary=false){
 return (summary?'SELECT SUM(_sample_interval * double1) AS filtered_custom_events':'SELECT index1 AS tool, blob1 AS action, blob2 AS mode,\n       SUM(_sample_interval * double1) AS events')+'\nFROM utilityshelf_tool_usage\nWHERE '+filters(days)+(summary?'':'\nGROUP BY tool, action, mode\nORDER BY events DESC')+';\n';
}
if(require.main===module)for(const [name,summary] of [['visitor-usage.sql',false],['visitor-total.sql',true]])fs.writeFileSync(path.join(__dirname,name),query(7,summary));
module.exports={query};
