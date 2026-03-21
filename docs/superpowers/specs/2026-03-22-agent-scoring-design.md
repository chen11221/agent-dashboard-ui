# Agent Dashboard Scoring System Design

## Overview
Implement a persistent agent scoring and leaderboard system for the OpenClaw control UI. The system provides automated reference scores based on task execution metrics (success, speed, response length) which the user must manually confirm.

## Architecture
- **Backend Storage:** `backend/scores.json` for persistence
- **Data Model:** Keyed by agent ID, storing total score and a history of transactions
- **Frontend Display:** A dedicated Leaderboard panel on the main dashboard

## Backend API Changes
1. `GET /api/scores`
   - Returns the current scores and history for all agents
2. `POST /api/scores/confirm`
   - Accepts `{ target: string, delta: number, reason: string }`
   - Appends to history, updates total score, saves to `scores.json`
3. `/api/dispatch` Updates
   - Measure execution time (start/end)
   - Evaluate response length (stdout length)
   - Evaluate success/failure (exit code)
   - Calculate `referenceScore` based on rules
   - Return `referenceScore` and `scoreDetails` to the frontend

## Scoring Rules (Reference)
- **Result:** Success (+10), Failure/Non-zero exit (-20)
- **Speed:** < 10s (+5), 10-30s (+2), > 30s (0)
- **Quality:** >= 50 chars (+5), 20-49 chars (+2), < 20 chars (0)

## Frontend UI Changes
1. **Leaderboard Component:**
   - Display a vertical list of agents sorted by score descending
   - Show recent score changes (+ green, - red)
2. **Score Confirmation Dialog:**
   - Pops up after a task finishes
   - Shows the execution summary, the system's calculated `referenceScore`, and the breakdown of points
   - Allows the user to adjust the score before clicking "Confirm"
3. **Integration:**
   - Modify `handleDispatch` to handle the new response format and trigger the dialog
   - Fetch initial scores on mount

## Testing Strategy
- Ensure `scores.json` is created if it doesn't exist
- Verify scores persist across Node.js restarts
- Verify the UI correctly sorts agents when scores change
