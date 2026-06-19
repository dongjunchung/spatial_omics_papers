# Setup

## 1. Create the repository

Create a private or public GitHub repository and upload this folder to it. A private
repository is appropriate if you do not want the digest archive publicly visible.

## 2. Add the API key

In the GitHub repository, open:

**Settings > Secrets and variables > Actions > New repository secret**

Create:

- `OPENAI_API_KEY`: an OpenAI API key with sufficient API credits.

Do not commit the key to the repository.

## 3. Optional configuration

Under **Settings > Secrets and variables > Actions > Variables**, optionally add:

- `OPENAI_MODEL`: defaults to `gpt-5.5`.
- `DIGEST_MAX_PAPERS`: defaults to `5`; supported range is 1-8.

## 4. Enable notifications

1. Open the repository's **Watch** menu.
2. Select **Custom**.
3. Enable **Issues**.
4. Confirm GitHub email notifications are enabled in your personal notification settings.

The workflow commits the full report and opens a short daily issue. GitHub then
sends the issue notification according to your account preferences.

## 5. Test it

Open **Actions > Daily spatial omics digest > Run workflow**. The manual run bypasses
the time-of-day gate.

After it completes, verify:

- A dated file exists under `digests/`.
- Technical SVG summaries exist under `images/YYYY-MM-DD/` for method digests, or resource tables appear in the digest for atlas/data-resource posts.
- `README.md` links to the latest digest.
- A new issue summarizes the report.

## Schedule behavior

GitHub Actions schedules use UTC and can start several minutes late. The workflow
runs at both UTC offsets used by New York and proceeds only when the local hour is
8 AM. This keeps the schedule aligned across daylight-saving changes.

## Costs and limits

The workflow uses the OpenAI Responses API with web search. API usage is billed to
the account associated with `OPENAI_API_KEY`. GitHub Actions usage depends on the
repository visibility and account plan.
