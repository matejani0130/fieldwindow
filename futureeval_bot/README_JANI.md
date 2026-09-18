# Jani FutureEval Bot — staging

Status: PREPARED, NOT YET LIVE.

This branch contains an isolated Metaculus FutureEval Fall 2026 bot based on the official Metaculus template.

## Current baseline
- Official forecasting-tools framework
- 3 independent research reports per question
- 3 predictions per research report (9 forecast samples/question)
- Automatic aggregation by forecasting-tools
- Automatic Metaculus submission when credentials are present
- GitHub Actions smoke test
- 20-minute autonomous tournament workflow
- Logs saved under logs/forecasts/

## Human work intentionally minimized
Jani should not forecast, research, code, or operate the bot manually.

Only unavoidable owner/account actions remain:
1. Create/log in to a Metaculus account and create a bot.
2. Obtain METACULUS_TOKEN.
3. Add token as a GitHub Actions repository secret.
4. Add a supported LLM credential if the Metaculus-provided route does not cover the run.
5. Trigger the one-time smoke test.
6. Complete payout/KYC/tax details only if required.

Never commit tokens or API keys to the repository.

## Important staging note
This code is intentionally on the non-default branch `futureeval-bot-2026` so it does not alter the FieldWindow production branch. GitHub scheduled workflows only run from the default branch. Before the Fall tournament goes live, move/fork this bot into its own repository (preferred) or explicitly promote the workflow after review.

Tournament: https://www.metaculus.com/tournament/fall-futureeval-2026/
Official participation guide: https://www.metaculus.com/futureeval/participate/
Official template: https://github.com/Metaculus/metac-bot-template
