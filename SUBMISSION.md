# MP3 submission

Due: Tuesday, November 3, 2026, 11:59 PM Central Time.

Repository: https://github.com/Phw5/mp3

Deployed API base URL: https://phw5-mp3.onrender.com

API endpoints: https://phw5-mp3.onrender.com/api/users and https://phw5-mp3.onrender.com/api/tasks

Submission form: https://forms.gle/4V1v2VWU78XwM3H57

Chatlog: To be provided separately with the course submission.

References: https://github.com/Phw5/mp3/blob/main/SOURCES.md

Autograder results: https://github.com/Phw5/mp3/blob/main/AUTOGRADER_RESULTS.txt

## Verification

On October 31, 2026, the deployed API passed all 19 course autograder checks for a score of 100/100 (20/20 points). The implementation also passes all 24 local integration tests on Node 24, including invalid requests, reference updates, concurrent requests, and transaction rollback.

The API is deployed on Render's free instance in Oregon using Node 24. Atlas has an active free cluster in the dedicated CS409 MP3 project. The mp3user database account has readWrite access to the mp3 database, and the required 0.0.0.0/0 network-access entry is active. The connection string is stored as a Render secret and in the private, ignored local .env file. The local Atlas connection was also verified successfully. API_URL in submit.js points to the actual deployed base URL; AUTOGRADER_URL is unchanged.

## Final student step

Submit the form yourself. Use your @illinois.edu email address, your NetID, the repository URL, and the deployed API base URL above. Cite SOURCES.md and include the LLM chatlog. Select Yes for LLM use and answer the hours and experience questions truthfully. The Comments field can remain empty.

The form allows only one submission, so check the links before submitting. Running npm run submit is only a self-check and does not submit the assignment. No video is required for MP3.

Keep the Atlas cluster and Render service available for grading. The free Render instance can take about a minute to wake up after inactivity.

.gitignore is retained and .env is ignored and untracked. Never put the database password or connection string in the repository, chatlog, or grading form.
