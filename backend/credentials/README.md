# Google Service Account Credentials

Place your Google Service Account JSON key file here.

## Steps to get the credentials file:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use an existing one)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin > Service Accounts**
5. Create a Service Account (give it a name like "sistema-par")
6. In the service account, create a JSON key (Actions > Manage keys > Add key > JSON)
7. Download the JSON file and rename it to `google-service-account.json`
8. Place it in this folder (`backend/credentials/`)

## Share the Spreadsheet

9. Copy the `client_email` from the JSON file (looks like `name@project.iam.gserviceaccount.com`)
10. Open your Google Sheets spreadsheet
11. Click **Share** and add the `client_email` with **Editor** permission

## Environment Variable

Make sure `backend/.env` has:
```
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./credentials/google-service-account.json
```

The Spreadsheet ID is the long string in the URL:
`https://docs.google.com/spreadsheets/d/**SPREADSHEET_ID**/edit`
