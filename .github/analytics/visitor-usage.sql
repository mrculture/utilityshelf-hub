SELECT index1 AS tool, blob1 AS action, blob2 AS mode,
       SUM(_sample_interval * double1) AS events
FROM utilityshelf_tool_usage
WHERE timestamp >= NOW() - INTERVAL '7' DAY
  AND blob3 = 'custom'
  AND NOT (
    (timestamp = toDateTime('2026-11-10 14:48:04', 'UTC') AND index1 = 'image-contact-sheet' AND blob1 = 'sheet_download' AND blob2 = 'sheet' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 14:48:03', 'UTC') AND index1 = 'filename-cleaner' AND blob1 = 'mapping_download' AND blob2 = 'numbered' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 14:47:59', 'UTC') AND index1 = 'filename-cleaner' AND blob1 = 'ready' AND blob2 = 'numbered' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 14:47:54', 'UTC') AND index1 = 'image-contact-sheet' AND blob1 = 'reorder' AND blob2 = 'sheet' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 14:47:39', 'UTC') AND index1 = 'image-dimension-checker' AND blob1 = 'ebay_preset' AND blob2 = 'ebay' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 14:47:39', 'UTC') AND index1 = 'image-dimension-checker' AND blob1 = 'check_complete' AND blob2 = 'ebay' AND blob3 = 'custom')
    OR (timestamp = toDateTime('2026-11-10 20:16:19', 'UTC') AND index1 = 'product-photo-workflow' AND blob1 = 'entry' AND blob2 = 'home' AND blob3 = 'custom')
  )
GROUP BY tool, action, mode
ORDER BY events DESC;
