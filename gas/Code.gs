// ==========================================
// OPD Medication Signature v2.0 - GAS Backend
// ==========================================

const SUPABASE_URL = "https://tlouhdllwlizqmfwewso.supabase.co";
// NOTE: Use your Supabase Service Role Key or Anon Key here
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3VoZGxsd2xpenFtZndld3NvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzk3ODUsImV4cCI6MjA5NzQ1NTc4NX0.EnqdQNFOOL73Ftu9tuGBYUBWbhNfFEpyMRANZ7qj0Ds";
const ARCHIVE_DRIVE_FOLDER_ID = "1e9BLxmrkxpNZ0ybzZ32DWydYIfzw1WH7";
const TRANSACTIONS_SHEET_NAME = "Transactions_v2"; // Create this sheet

// 1. Webhook for Syncing to Sheets
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "No data" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    const data = JSON.parse(e.postData.contents);
    if (data.action === "syncToSheets") {
      const p = data.payload;
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRANSACTIONS_SHEET_NAME);
      
      if (!sheet) {
        throw new Error("Sheet 'Transactions_v2' not found");
      }
      
      // We write: [RecordID, HN, Date, StaffID, StaffName, ReceiverType, ImageURL, ImagePreview]
      const formula = `=IMAGE("${p.signatureUrl}")`;
      const now = new Date();
      
      sheet.appendRow([
        p.recordId,
        p.hn,
        now,
        p.serviceDate,
        p.staffId,
        p.staffName,
        p.receiverType,
        p.signatureUrl,
        formula
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Unknown action" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. Archive Script (Run this on a Time-Driven Trigger, e.g., Monthly)
function runArchiveOldSignatures() {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const cutoffDate = sixMonthsAgo.toISOString();
  
  // 1. Get old transactions from Supabase that haven't been archived
  // Using REST API
  const queryUrl = `${SUPABASE_URL}/rest/v1/transactions?created_at=lt.${cutoffDate}&drive_archive_url=is.null&select=id,signature_url,hn`;
  
  const options = {
    method: "GET",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    }
  };
  
  const response = UrlFetchApp.fetch(queryUrl, options);
  const records = JSON.parse(response.getContentText());
  
  Logger.log("Found " + records.length + " records to archive.");
  
  const folder = DriveApp.getFolderById(ARCHIVE_DRIVE_FOLDER_ID);
  
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    try {
      // 2. Download Image
      const imageResponse = UrlFetchApp.fetch(rec.signature_url);
      const blob = imageResponse.getBlob().setName(`${rec.hn}_${rec.id}.png`);
      
      // 3. Save to Google Drive
      const file = folder.createFile(blob);
      const driveUrl = file.getUrl();
      
      // 4. Update Supabase Record
      const updateUrl = `${SUPABASE_URL}/rest/v1/transactions?id=eq.${rec.id}`;
      const updateOptions = {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        payload: JSON.stringify({
          drive_archive_url: driveUrl
        })
      };
      UrlFetchApp.fetch(updateUrl, updateOptions);
      
      // 5. Delete from Supabase Storage
      // Parse object path from public URL
      // Example: https://xxx.supabase.co/storage/v1/object/public/signatures/2026/06/19/hn.png
      const match = rec.signature_url.match(/public\/signatures\/(.+)$/);
      if (match && match[1]) {
        const objectPath = match[1];
        const deleteUrl = `${SUPABASE_URL}/storage/v1/object/signatures/${objectPath}`;
        const deleteOptions = {
          method: "DELETE",
          headers: {
            "apikey": SUPABASE_KEY,
            "Authorization": "Bearer " + SUPABASE_KEY
          }
        };
        UrlFetchApp.fetch(deleteUrl, deleteOptions);
      }
      
      Logger.log("Archived successfully: " + rec.id);
      
    } catch (err) {
      Logger.log("Failed to archive record " + rec.id + ": " + err.message);
    }
  }
}
