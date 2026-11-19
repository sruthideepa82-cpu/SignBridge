# DTW baseline (Stage 2): internal diagnostics

> **Within-clip and NOT independent.** One assumed clip per phrase. Overlapping windows of one clip are
> not independent samples. These numbers describe nearest-clip structure and rejection behaviour only.
> They are not accuracy and not real-world recognition performance.

Distance: Classic DTW, no band. Local cost = Euclidean distance between 141-value per-frame vectors. Total cost divided by (T + S) = 64 for two 32-frame windows, so distances are comparable across pairs of equal length.

Reference windows: 252 (28 clips x 9 windows, all eligible).
Reproducible distance matrix across two runs: True.

## Threshold

- Rule: 95th percentile of in-set nearest different-clip distance. Value: 4.3409.
- Ambiguity: nearest different-clip distance must be at least 1.05 x the runner-up.
- The threshold is taken from this dataset's own geometry. It is not validated on new recordings.

## Distances

- Nearest different-clip distance (in-set): {"n": 252, "min": 0.9867, "p05": 1.0106, "median": 2.5109, "p95": 4.3409, "max": 4.9269}
- Same-clip overlapping window distance (non-independent, pipeline check only): {"n": 252, "min": 0.0046, "p05": 0.0103, "median": 0.0504, "p95": 0.2148, "max": 0.4259}
- Undetermined probes, nearest distance to the dynamic bank: {"n": 45, "min": 2.3229, "p05": 2.3352, "median": 2.6338, "p95": 3.1441, "max": 3.1709}
- Static probes (train and held), nearest distance to the dynamic bank: {"n": 99, "min": 1.3639, "p05": 1.377, "median": 1.9234, "p95": 3.1068, "max": 3.1128}

The rejection threshold is set by in-set distances only, so out-of-set probes that sit inside the in-set range
are not rejected. This is the main limitation of the rule, not a tuning opportunity: changing the threshold to reject
more probes would also reject in-set windows, and no independent data exists to choose between them.

## Decisions (counts)

| Group | n | Accepted | Ambiguous | Rejected |
| --- | ---: | ---: | ---: | ---: |
| Dynamic in-set (other-clip reference) | 252 | 167 (0.663) | 72 (0.286) | 13 (0.052) |
| Undetermined out-of-set | 45 | 25 (0.556) | 20 (0.444) | 0 (0.0) |
| Static out-of-set (train and held) | 99 | 90 (0.909) | 9 (0.091) | 0 (0.0) |

In-set acceptance is not a success rate: the reference set is built to contain other phrases only,
so a query cannot be correct. These counts show how often the rule keeps a window at all.

## Missing-hand effect (nearest different-clip distance by hand share)

| Hand share | n | Median | p95 |
| --- | ---: | ---: | ---: |
| <0.80 | 9 | 4.0705 | 4.0964 |
| 0.80-0.95 | 22 | 3.0422 | 3.2220 |
| >=0.95 | 221 | 2.1233 | 4.3420 |

## Clip-to-clip nearest distance (min over windows)

Lower values mean two phrases look more alike under this distance. The diagonal is the overlap of a clip with itself.

See clip_distance_matrix.csv for the full 28 x 28 table.

## Limitations

- One recording per phrase: no independent evaluation is possible.
- Overlapping windows are not independent samples.
- Frame rate unknown: DTW compares frame index order, not real timing.
- Presence effects: classes with no two-hand frames are compared with zero-filled second-hand blocks.
- 'open' is included (manifest dynamic class) although it was not in the approved 27-name list; its hand-size outliers are kept, not removed.
- Single-hand and hand-size outliers were not removed; see dynamic_sequence_quality.md.
- Live serving samples camera frames in VIDEO mode at a different rate; these training windows came from IMAGE-mode stills.

