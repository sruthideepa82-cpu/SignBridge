# Dynamic sequence quality (Stage 2)

Within-clip windows. Every window is a 32-frame stride-1 slice of one 40-frame clip, so windows of the same
clip overlap and are NOT independent. Frame rate unknown; windows use frame index only.

- Phrases: 28
- Windows: 252 (252 eligible, 0 excluded)
- Feature dimension per window: 4512 flat, 141 per frame x 32 frames
- Non-finite feature values: 0
- Hand-size anomalies (per present hand-frame): 218
- Coordinates outside [-0.1, 1.1]: 1

## Per phrase

| Phrase | Windows | Eligible | Mean hand share | Two-hand frames | Hand-size anomalies | Velocity p95 | Flags |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| again | 9 | 9 | 1.0 | 32.0 | 0 | 0.2682 |  |
| agree | 9 | 9 | 1.0 | 27.33 | 0 | 0.8016 | high velocity p95 |
| answer | 9 | 9 | 1.0 | 32.0 | 0 | 1.0827 | high velocity p95 |
| attendance | 9 | 9 | 1.0 | 10.44 | 0 | 0.5611 | high velocity p95 |
| book | 9 | 9 | 0.6875 | 5.44 | 45 | 0.8678 | hand-size anomalies; high velocity p95 |
| break | 9 | 9 | 1.0 | 24.56 | 0 | 1.3163 | high velocity p95 |
| congratulations | 9 | 9 | 1.0 | 5.33 | 0 | 1.8704 | high velocity p95 |
| email | 9 | 9 | 1.0 | 15.89 | 0 | 1.1044 | high velocity p95 |
| file | 9 | 9 | 1.0 | 14.33 | 0 | 0.7374 | high velocity p95 |
| good morning | 9 | 9 | 0.9688 | 0.0 | 0 | 0.6409 | coords outside image; high velocity p95 |
| home | 9 | 9 | 0.9757 | 11.33 | 0 | 0.3794 |  |
| how are you | 9 | 9 | 1.0 | 17.22 | 0 | 1.4144 | high velocity p95 |
| i need help | 9 | 9 | 0.8958 | 5.33 | 0 | 1.3359 | high velocity p95 |
| join | 9 | 9 | 1.0 | 0.0 | 0 | 0.927 | high velocity p95 |
| meet | 9 | 9 | 1.0 | 32.0 | 0 | 0.581 | high velocity p95 |
| open | 9 | 9 | 0.9653 | 25.89 | 104 | 1.0341 | hand-size anomalies; high velocity p95 |
| pass | 9 | 9 | 1.0 | 32.0 | 0 | 0.7892 | high velocity p95 |
| please | 9 | 9 | 1.0 | 0.0 | 0 | 0.7837 | high velocity p95 |
| practice | 9 | 9 | 1.0 | 20.44 | 6 | 1.284 | hand-size anomalies; high velocity p95 |
| pressure | 9 | 9 | 1.0 | 16.0 | 0 | 0.3733 |  |
| seat | 9 | 9 | 1.0 | 28.33 | 0 | 5.443 | high velocity p95 |
| sun | 9 | 9 | 1.0 | 0.0 | 0 | 0.7065 | high velocity p95 |
| team | 9 | 9 | 0.9375 | 4.0 | 63 | 1.7061 | hand-size anomalies; high velocity p95 |
| thirsty | 9 | 9 | 1.0 | 0.0 | 0 | 0.5341 | high velocity p95 |
| this | 9 | 9 | 1.0 | 0.0 | 0 | 0.7677 | high velocity p95 |
| together | 9 | 9 | 1.0 | 0.56 | 0 | 0.6513 | high velocity p95 |
| wait | 9 | 9 | 1.0 | 0.0 | 0 | 0.915 | high velocity p95 |
| where | 9 | 9 | 1.0 | 32.0 | 0 | 0.3604 |  |
