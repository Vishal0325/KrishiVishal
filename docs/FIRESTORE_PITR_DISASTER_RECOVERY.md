# Firestore Point-in-Time Recovery (PITR) Disaster Recovery Runbook

## 1. Overview & Retention Policy

Cloud Firestore Point-in-Time Recovery (PITR) provides continuous data protection for the KrishiVishal platform database (`projects/krishivishal-a9ed7/databases/(default)`).

- **PITR Status**: `POINT_IN_TIME_RECOVERY_ENABLED`
- **Retention Window**: 7 days (`604800` seconds)
- **Granularity**: Second-level recovery capability
- **Primary Region**: `asia-south1` (Mumbai)

PITR allows restoring data to any exact second within the last 7 days. This protects against accidental bulk data deletion, corrupted admin operations, or malicious updates.

---

## 2. Important Safety Principles

> [!CAUTION]
> **Production Overwrite Protection**:
> Firestore **does not** allow restoring directly into an existing active database. A PITR restore **MUST** target a new, non-existent database ID (e.g., `pitr-test-restore` or `restored-db-20261001`). This guarantees zero downtime and zero risk to live production data during recovery tests or incident response.

1. **Never attempt to overwrite `(default)` database.**
2. **Always test data validity in the restored target before repointing services.**
3. **Delete temporary restore databases immediately after verification to prevent extra storage charges.**

---

## 3. Prerequisites & Authentication

Ensure Google Cloud SDK (`gcloud`) is installed and configured:

```bash
# Verify gcloud version and active project
gcloud --version
gcloud config set project krishivishal-a9ed7

# Verify PITR enablement and earliest version time
gcloud firestore databases describe --database="(default)" --format="json"
```

Required IAM permissions:
- `roles/datastore.owner` or `roles/owner` on GCP project `krishivishal-a9ed7`.

---

## 4. Step-by-Step Recovery Procedure

### Step 4.1: Determine Recovery Timestamp
Choose the target timestamp (ISO 8601 UTC format, e.g. `2026-10-01T15:00:00Z`). Ensure this timestamp is greater than `earliestVersionTime` reported by `gcloud firestore databases describe`.

### Step 4.2: Execute Database Restore
Run the restore command to instantiate a new database instance:

```bash
gcloud firestore databases restore \
  --source-database="(default)" \
  --destination-database="pitr-test-restore" \
  --recovery-point="2026-10-01T15:00:00Z" \
  --project="krishivishal-a9ed7"
```

### Step 4.3: Monitor Restoration Progress
The restore process operates as a Long-Running Operation (LRO). You can monitor progress with:

```bash
gcloud firestore databases list --project="krishivishal-a9ed7"
```

### Step 4.4: Verify Restored Data
Once the operation completes:
1. Inspect document collections in the restored database (`pitr-test-restore`).
2. Run data integrity checks on key collections (`orders`, `users`, `skus`, `ledgers`).

---

## 5. Post-Verification & Cleanup

Once verification is finished, delete the temporary database to avoid incurring ongoing storage costs:

```bash
gcloud firestore databases delete pitr-test-restore \
  --project="krishivishal-a9ed7" \
  --quiet
```

Confirm that only the `(default)` database remains:

```bash
gcloud firestore databases list --project="krishivishal-a9ed7"
```

---

## 6. Automated Testing Script

An automated PowerShell script is available for periodic DR verification:
`scripts/test_pitr_restore.ps1`

Run dry-run verification:
```powershell
.\scripts\test_pitr_restore.ps1
```
