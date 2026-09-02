# Stage 2 authentication POC frontend

This static page is only for the isolated fake-data test environment. It must not be configured with the production Apps Script deployment or production spreadsheet.

## Configuration

`config.js` contains two replaceable public identifiers:

- The test OAuth Web application client ID.
- The test Apps Script API Executable deployment ID.

OAuth client IDs and deployment IDs are not client secrets. Never add an OAuth client secret, access token, refresh token, or `.clasprc.json` file here.

The OAuth client's authorized JavaScript origin must exactly match the origin serving this directory. A GitHub Pages project site normally uses an origin such as `https://geng-geng8.github.io`; the repository path is not part of the origin. Configure the exact value shown in the deployed browser address.

## Token behavior

- The token exists only in the `accessToken` closure variable.
- No browser persistence API is used for the token.
- Reloading or closing the page discards the token.
- The page refuses API calls when fewer than six minutes remain and requires another user-initiated authorization.
- The sign-out button revokes the token when possible and always clears local memory.

## Testing caution

All successful CRUD calls must show only the synthetic records from `test-apps-script/fake-transactions.csv`. Stop immediately if any real transaction or unexpected spreadsheet title appears.
