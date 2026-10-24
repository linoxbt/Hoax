-- Policies saved before the 5 s minimum cooldown: raised to it, so the engine
-- (which re-validates every policy) keeps protecting them instead of refusing.
UPDATE policies SET cooldown_s = 5 WHERE cooldown_s < 5;

-- Liquidations recorded before the ledger existed (missed receipts carry the
-- block and the liquidation tx), so a close still pending across the upgrade
-- cannot be credited as a save after one of them.
INSERT INTO liquidations (account_id, pool, block, tx_hash, size_delta)
SELECT account_id, lower(pool), block, coalesce(receipt->>'txHash', 'pre-ledger:' || id::text), 0
  FROM actions
 WHERE outcome = 'missed' AND block IS NOT NULL
ON CONFLICT DO NOTHING;
