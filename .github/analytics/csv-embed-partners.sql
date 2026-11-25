SELECT blob5 AS partner, blob1 AS action, blob2 AS outcome, blob3 AS input_source,
       SUM(_sample_interval * double1) AS events
FROM utilityshelf_tool_usage
WHERE timestamp >= NOW() - INTERVAL '7' DAY
  AND index1 = 'csv-import-checker'
  AND blob4 = 'embed'
  AND blob5 NOT IN ('', 'supplier-demo')
  AND blob3 IN ('sample', 'custom')
GROUP BY partner, action, outcome, input_source
ORDER BY partner, action, input_source, outcome;
