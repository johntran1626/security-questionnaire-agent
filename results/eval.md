### Dev set (Kestrelbyte, used for tuning)

| System | Model | Safe automation | False promises | Decision accuracy | Over-flagging | Citations valid | Injections resisted | Commitments flagged | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| agent | claude-haiku-5-5 | 41/80 (51%, 40-62) | 1/80 (upper 6.8%) | 65/80 (81%, 71-88) | 6/54 (11%, 5-22) | 50/50 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 3.78s / 6.52s | $0.0010 |
| agent | claude-sonnet-5-5 | 44/80 (55%, 44-65) | 1/80 (upper 6.8%) | 70/80 (88%, 78-93) | 5/54 (9%, 4-20) | 49/49 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 5.0s / 7.39s | $0.0169 |
| paste_all | claude-haiku-5-5 | 47/80 (59%, 48-69) | 8/80 (upper 18.5%) | 65/80 (81%, 71-88) | 2/54 (4%, 1-13) | 60/60 (100%, 94-100) | 7/8 (88%, 53-98) | 8/8 (100%, 68-100) | 1.07s / 2.87s | $0.0005 |
| paste_all | claude-sonnet-5-5 | 48/80 (60%, 49-70) | 0/80 (upper 4.6%) | 74/80 (92%, 85-97) | 3/54 (6%, 2-15) | 51/51 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 2.05s / 3.83s | $0.0090 |
| paste_all+check | claude-haiku-5-5 | 47/80 (59%, 48-69) | 8/80 (upper 18.5%) | 65/80 (81%, 71-88) | 2/54 (4%, 1-13) | 60/60 (100%, 94-100) | 7/8 (88%, 53-98) | 8/8 (100%, 68-100) | 1.07s / 2.87s | $0.0005 |
| paste_all+check | claude-sonnet-5-5 | 48/80 (60%, 49-70) | 0/80 (upper 4.6%) | 74/80 (92%, 85-97) | 3/54 (6%, 2-15) | 51/51 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 2.05s / 3.83s | $0.0090 |
| keyword | keyword-search | 18/80 (22%, 15-33) | 44/80 (upper 65.4%) | 33/80 (41%, 31-52) | 3/54 (6%, 2-15) | 68/68 (100%, 95-100) | 1/8 (12%, 2-47) | 2/8 (25%, 7-59) | 0.0s / 0.0s | $0.0000 |
| always_flag | none | 0/80 (0%, 0-5) | 0/80 (upper 4.6%) | 26/80 (32%, 23-43) | 54/54 (100%, 93-100) | n/a | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 0.0s / 0.0s | $0.0000 |

### Scale test (knowledge base padded with unrelated company documents)

| Set | System | Model | KB size | Safe automation | False promises | Over-flagging | Input tokens / question | Cache-read share | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| dev | keyword | keyword-search | 1x | 18/80 (22%, 15-33) | 44/80 (upper 65.4%) | 3/54 (6%, 2-15) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 10x | 17/80 (21%, 14-31) | 52/80 (upper 74.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 50x | 17/80 (21%, 14-31) | 52/80 (upper 74.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 100x | 17/80 (21%, 14-31) | 53/80 (upper 75.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |

Counts are questions; ranges are 95% Wilson intervals. Safe automation is out of all questions; the ceiling is the share of answerable questions. paste_all+check is paste_all after the same citation check the agent gets.
