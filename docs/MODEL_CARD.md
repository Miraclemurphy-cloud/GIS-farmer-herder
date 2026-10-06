# Model card: two-week incident risk

## Purpose

Rank ~36 km² areas of Benue and Plateau by the likelihood of at least one farmer–herder conflict incident in the next
two weeks, so analysts can prioritise verification, patrols and early warnings. The output is decision support for
trained staff, not an automated trigger: every alert requires human approval.

## Unit and target

- Unit: H3 resolution-6 cell × ISO week (1 716 cells).
- Target: 1 if any incident occurs in the cell in week *t* or *t+1*.

## Features (all computed from data before week *t*)

| Group | Features |
| --- | --- |
| Incident history | incidents last week, last 4 / 12 / 52 weeks; fatalities last 12 weeks; weeks since last incident |
| Spatial spill-over | incidents in neighbouring cells (ring 1: 4, 12, 52 weeks; ring 2: 12 weeks) |
| Satellite | FIRMS fire detections last week / 4 weeks; neighbouring fires last week |
| Environment | rainfall over 4 weeks and its anomaly vs. the cell's climatology |
| Calendar | month, dry-season flag (Nov–Apr), seasonal sine/cosine |
| Geography | latitude, longitude, distance to state and LGA borders, state |

**Deliberately excluded:** ethnicity, religion, language or any group identity of people in an area, and of actors in
past events. ACLED actor text is used only to select which historical events are relevant; it is never a feature.

`tests/test_features.py` verifies that changing any data from week *t* onward leaves week *t*'s features unchanged.
(Known minor exception: the rainfall anomaly uses whole-period climatology.)

## Method

- Baseline: each cell's smoothed historical positive rate.
- Model: LightGBM (400 trees, learning rate 0.03), then isotonic calibration on the most recent 26 training weeks.
- Validation: rolling origin. Train on everything before a 26-week test block (with a 2-week gap), test on the block;
  repeated for the last four blocks.
- Metrics: top-5 % capture (share of incidents in the 5 % of cells ranked riskiest), ROC-AUC, PR-AUC, Brier score.
- Retrained monthly and rescored nightly by the worker; each run's metrics are stored in `model_runs` and shown on the
  Predictions page.

## Current results

These are on **synthetic demo data** (no ACLED credentials yet), so they show that the pipeline works, not real-world skill.

| Metric (mean of 4 test blocks) | Model | Baseline |
| --- | --- | --- |
| Top-5 % capture | 0.49 | 0.40 |
| ROC-AUC | 0.88 | 0.81 |
| PR-AUC | 0.048 | 0.040 |
| Brier | 0.0042 | 0.0042 |

Retrain on ACLED data and update this table before any operational use.

## Limitations and risks

- **Reporting bias.** Incidents in remote or less-connected areas are under-reported, so the model under-predicts there.
  Absence of risk on the map is not evidence of safety.
- **Feedback loops.** Areas that receive more attention generate more reports, which raises their predicted risk.
- **Rare events.** Calibrated probabilities are low (base rate ~0.5 %). Use the relative ranking, not the absolute number.
- **Misuse.** Risk maps must not be used to profile or target communities, justify collective punishment, or restrict
  movement of any group. Access is limited to authenticated staff and all access is audited.
- **False alarms** can cause panic and reprisals. Rules only draft alerts; analysts must corroborate before approving.
