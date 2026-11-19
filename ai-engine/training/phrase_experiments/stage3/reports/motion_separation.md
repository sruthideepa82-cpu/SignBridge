# Motion separation: dynamic vs static vs undetermined windows (Stage 3)

> dynamic and static labels were defined from the same motion rule; separation is partly circular.

Measure: summed wrist path per window, in hand-size units, over both hands.

| Group | n | Min | p05 | Median | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dynamic | 252 | 3.017 | 3.601 | 9.739 | 50.049 | 63.114 |
| static | 99 | 0.242 | 0.510 | 3.275 | 7.196 | 7.791 |
| undetermined | 18 | 0.851 | 0.851 | 1.643 | 2.059 | 2.284 |

- AUC dynamic vs static: 0.939
- AUC dynamic vs undetermined: 1.000
- Fraction of static windows above the dynamic median: 0.000

Interpretation: an AUC near 1 means motion energy alone separates the groups in this data. Because the labels
came from the same motion measure, a high AUC does not show that the model would separate new recordings.
A value near 0.5 would mean motion energy does not separate the groups even on this data.
