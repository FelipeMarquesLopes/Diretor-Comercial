-- 0007: categoria "reajuste" (rode esta linha SOZINHA no SQL Editor).
--
-- ALTER TYPE ... ADD VALUE precisa rodar isolado. Depois rode a 0008.

alter type partner_category add value if not exists 'reajuste';
