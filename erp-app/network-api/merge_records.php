<?php
/**
 * Merge two JSON record arrays by id — newest updatedAt/createdAt wins.
 * Used by sync_patch.php for multi-terminal conflict resolution.
 */

function tcRecordSortTs($row) {
    if (!is_array($row)) return '';
    $ts = $row['updatedAt'] ?? $row['createdAt'] ?? $row['billedAt'] ?? $row['date'] ?? '';
    return (string)$ts;
}

function tcMergeRecordArraysByNewest($localArr, $remoteArr) {
    $byId = [];
    $noId = [];

    $ingest = function ($arr) use (&$byId, &$noId) {
        if (!is_array($arr)) return;
        foreach ($arr as $row) {
            if (!is_array($row)) continue;
            if (!isset($row['id'])) {
                $noId[] = $row;
                continue;
            }
            $id = (string)$row['id'];
            if (!isset($byId[$id])) {
                $byId[$id] = $row;
                continue;
            }
            $prev = $byId[$id];
            $byId[$id] = (tcRecordSortTs($row) >= tcRecordSortTs($prev)) ? $row : $prev;
        }
    };

    $ingest($localArr);
    $ingest($remoteArr);

    return array_merge(array_values($byId), $noId);
}
