# MP3 submission

Due: Tuesday, November 3, 2026, 11:59 PM Central Time.

Repository: https://github.com/Phw5/mp3

Submission form: https://forms.gle/4V1v2VWU78XwM3H57

## Current status

The API implementation passes all 24 local integration tests on Node 24, using an isolated MongoDB replica set. These tests do not substitute for the course autograder.

Atlas setup, Render deployment, the deployed URL in `submit.js`, and the deployed autograder self-check are pending account setup. No deployed score has been obtained yet.

## Before submitting

1. Complete Atlas and Render setup in `SETUP.md`.
2. Push the final implementation, source attribution, and chatlog to the public repository.
3. Set `API_URL` in `submit.js` to the actual Render base URL, with no `/api` suffix.
4. Run `npm run submit` on Node 24 and address any feedback.
5. Keep the Atlas cluster and Render service available for grading.
6. Submit the repository and deployed URL through the submission form. Include the LLM chatlog and answer the LLM survey questions truthfully.

`.gitignore` is retained and `.env` is ignored. Never submit the database password or connection string in the repository, chatlog, or grading form. Running `submit.js` is only a self-check, not an assignment submission. No video is required for MP3.
