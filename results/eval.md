### Held-out set (Tidemark HR, reported numbers)

| System | Model | Safe automation | False promises | Decision accuracy | Over-flagging | Citations valid | Injections resisted | Commitments flagged | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| agent | claude-haiku-5-5 | 63/148 (43%, 35-51) | 4/148 (upper 6.7%) | 118/148 (80%, 73-85) | 12/91 (13%, 8-22) | 81/81 (100%, 95-100) | 19/20 (95%, 76-99) | 20/20 (100%, 84-100) | 4.18s / 6.9s | $0.0006 |
| paste_all | claude-haiku-5-5 | 67/148 (45%, 37-53) | 8/148 (upper 10.3%) | 116/148 (78%, 71-84) | 7/91 (8%, 4-15) | 92/92 (100%, 96-100) | 18/20 (90%, 70-97) | 20/20 (100%, 84-100) | 1.21s / 3.12s | $0.0002 |
| paste_all+check | claude-haiku-5-5 | 67/148 (45%, 37-53) | 8/148 (upper 10.3%) | 116/148 (78%, 71-84) | 7/91 (8%, 4-15) | 92/92 (100%, 96-100) | 18/20 (90%, 70-97) | 20/20 (100%, 84-100) | 1.21s / 3.12s | $0.0002 |
| keyword | keyword-search | 31/148 (21%, 15-28) | 95/148 (upper 71.5%) | 51/148 (34%, 27-42) | 2/91 (2%, 1-8) | 132/132 (100%, 97-100) | 2/20 (10%, 3-30) | 6/20 (30%, 15-52) | 0.0s / 0.0s | $0.0000 |
| always_flag | none | 0/148 (0%, 0-3) | 0/148 (upper 2.5%) | 57/148 (39%, 31-47) | 91/91 (100%, 96-100) | n/a | 20/20 (100%, 84-100) | 20/20 (100%, 84-100) | 0.0s / 0.0s | $0.0000 |

### Held-out set, excluding questions with known label conflicts (post-hoc, see eval/audit.py): 15 excluded, 133 kept

| System | Model | Safe automation | False promises | Decision accuracy | Over-flagging | Citations valid | Injections resisted | Commitments flagged | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| agent | claude-haiku-5-5 | 60/133 (45%, 37-54) | 4/133 (upper 7.5%) | 114/133 (86%, 79-91) | 2/77 (3%, 1-9) | 77/77 (100%, 95-100) | 18/19 (95%, 75-99) | 20/20 (100%, 84-100) | 4.05s / 6.73s | $0.0006 |
| paste_all | claude-haiku-5-5 | 58/133 (44%, 35-52) | 7/133 (upper 10.5%) | 107/133 (80%, 73-86) | 4/77 (5%, 2-13) | 80/80 (100%, 95-100) | 17/19 (89%, 69-97) | 20/20 (100%, 84-100) | 1.2s / 2.97s | $0.0002 |
| paste_all+check | claude-haiku-5-5 | 58/133 (44%, 35-52) | 7/133 (upper 10.5%) | 107/133 (80%, 73-86) | 4/77 (5%, 2-13) | 80/80 (100%, 95-100) | 17/19 (89%, 69-97) | 20/20 (100%, 84-100) | 1.2s / 2.97s | $0.0002 |
| keyword | keyword-search | 25/133 (19%, 13-26) | 87/133 (upper 73.0%) | 44/133 (33%, 26-41) | 2/77 (3%, 1-9) | 117/117 (100%, 97-100) | 2/19 (11%, 3-31) | 6/20 (30%, 15-52) | 0.0s / 0.0s | $0.0000 |
| always_flag | none | 0/133 (0%, 0-3) | 0/133 (upper 2.8%) | 56/133 (42%, 34-51) | 77/77 (100%, 95-100) | n/a | 19/19 (100%, 83-100) | 20/20 (100%, 84-100) | 0.0s / 0.0s | $0.0000 |

### Dev set (Kestrelbyte, used for tuning)

| System | Model | Safe automation | False promises | Decision accuracy | Over-flagging | Citations valid | Injections resisted | Commitments flagged | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| agent | claude-haiku-5-5 | 41/80 (51%, 40-62) | 1/80 (upper 6.8%) | 65/80 (81%, 71-88) | 6/54 (11%, 5-22) | 50/50 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 3.78s / 6.52s | $0.0010 |
| agent | claude-sonnet-5-5 | 44/80 (55%, 44-65) | 1/80 (upper 6.8%) | 70/80 (88%, 78-93) | 5/54 (9%, 4-20) | 49/49 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 5.0s / 7.39s | $0.0169 |
| paste_all | claude-haiku-5-5 | 45/80 (56%, 45-67) | 9/80 (upper 20.0%) | 62/80 (78%, 67-85) | 3/54 (6%, 2-15) | 60/60 (100%, 94-100) | 7/8 (88%, 53-98) | 8/8 (100%, 68-100) | 1.15s / 2.75s | $0.0002 |
| paste_all | claude-sonnet-5-5 | 48/80 (60%, 49-70) | 0/80 (upper 4.6%) | 74/80 (92%, 85-97) | 3/54 (6%, 2-15) | 51/51 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 2.05s / 3.83s | $0.0090 |
| paste_all+check | claude-haiku-5-5 | 45/80 (56%, 45-67) | 9/80 (upper 20.0%) | 62/80 (78%, 67-85) | 3/54 (6%, 2-15) | 60/60 (100%, 94-100) | 7/8 (88%, 53-98) | 8/8 (100%, 68-100) | 1.15s / 2.75s | $0.0002 |
| paste_all+check | claude-sonnet-5-5 | 48/80 (60%, 49-70) | 0/80 (upper 4.6%) | 74/80 (92%, 85-97) | 3/54 (6%, 2-15) | 51/51 (100%, 93-100) | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 2.05s / 3.83s | $0.0090 |
| keyword | keyword-search | 18/80 (22%, 15-33) | 44/80 (upper 65.4%) | 33/80 (41%, 31-52) | 3/54 (6%, 2-15) | 68/68 (100%, 95-100) | 1/8 (12%, 2-47) | 2/8 (25%, 7-59) | 0.0s / 0.0s | $0.0000 |
| always_flag | none | 0/80 (0%, 0-5) | 0/80 (upper 4.6%) | 26/80 (32%, 23-43) | 54/54 (100%, 93-100) | n/a | 8/8 (100%, 68-100) | 8/8 (100%, 68-100) | 0.0s / 0.0s | $0.0000 |

### Scale test (knowledge base padded with unrelated company documents)

| Set | System | Model | KB size | Safe automation | False promises | Over-flagging | Input tokens / question | Cache-read share | Latency p50 / p95 | Cost / question |
|---|---|---|---|---|---|---|---|---|---|---|
| dev | agent | claude-haiku-5-5 | 1x | 41/80 (51%, 40-62) | 1/80 (upper 6.8%) | 6/54 (11%, 5-22) | 7,664 | 0% | 3.78s / 6.52s | $0.0010 |
| dev | agent | claude-haiku-5-5 | 10x | 42/80 (52%, 42-63) | 0/80 (upper 4.6%) | 4/54 (7%, 3-18) | 7,741 | 69% | 3.76s / 6.22s | $0.0006 |
| dev | agent | claude-haiku-5-5 | 50x | 42/80 (52%, 42-63) | 0/80 (upper 4.6%) | 4/54 (7%, 3-18) | 7,594 | 70% | 3.56s / 5.93s | $0.0005 |
| dev | agent | claude-haiku-5-5 | 100x | 39/80 (49%, 38-60) | 1/80 (upper 6.8%) | 6/54 (11%, 5-22) | 7,884 | 69% | 3.81s / 5.96s | $0.0006 |
| dev | paste_all | claude-haiku-5-5 | 1x | 45/80 (56%, 45-67) | 9/80 (upper 20.0%) | 3/54 (6%, 2-15) | 3,474 | 98% | 1.15s / 2.75s | $0.0002 |
| dev | paste_all | claude-haiku-5-5 | 10x | 44/80 (55%, 44-65) | 4/80 (upper 12.2%) | 5/54 (9%, 4-20) | 23,955 | 99% | 1.35s / 2.98s | $0.0004 |
| dev | paste_all | claude-haiku-5-5 | 50x | 43/80 (54%, 43-64) | 7/80 (upper 17.0%) | 4/54 (7%, 3-18) | 118,714 | 99% | 1.33s / 3.42s | $0.0074 |
| dev | paste_all | claude-haiku-5-5 | 100x | 40/80 (50%, 39-61) | 9/80 (upper 20.0%) | 7/54 (13%, 6-24) | 236,016 | 99% | 1.63s / 3.29s | $0.0140 |
| dev | paste_all+check | claude-haiku-5-5 | 1x | 45/80 (56%, 45-67) | 9/80 (upper 20.0%) | 3/54 (6%, 2-15) | 3,474 | 98% | 1.15s / 2.75s | $0.0002 |
| dev | paste_all+check | claude-haiku-5-5 | 10x | 44/80 (55%, 44-65) | 4/80 (upper 12.2%) | 5/54 (9%, 4-20) | 23,955 | 99% | 1.35s / 2.98s | $0.0004 |
| dev | paste_all+check | claude-haiku-5-5 | 50x | 43/80 (54%, 43-64) | 7/80 (upper 17.0%) | 4/54 (7%, 3-18) | 118,714 | 99% | 1.33s / 3.42s | $0.0074 |
| dev | paste_all+check | claude-haiku-5-5 | 100x | 40/80 (50%, 39-61) | 9/80 (upper 20.0%) | 7/54 (13%, 6-24) | 236,016 | 99% | 1.63s / 3.29s | $0.0140 |
| dev | keyword | keyword-search | 1x | 18/80 (22%, 15-33) | 44/80 (upper 65.4%) | 3/54 (6%, 2-15) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 10x | 17/80 (21%, 14-31) | 52/80 (upper 74.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 50x | 17/80 (21%, 14-31) | 52/80 (upper 74.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |
| dev | keyword | keyword-search | 100x | 17/80 (21%, 14-31) | 53/80 (upper 75.6%) | 0/54 (0%, 0-7) | 0 | 0% | 0.0s / 0.0s | $0.0000 |

Counts are questions; ranges are 95% Wilson intervals. Safe automation is out of all questions; the ceiling is the share of answerable questions. paste_all+check is paste_all after the same citation check the agent gets.
