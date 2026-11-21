# API examples

These examples assume the API runs on `http://localhost:3000`, `jq` is installed, and `.env` has a valid JWT secret.

## Register, sign in, create a project and task

```sh
API=http://localhost:3000/api
EMAIL=alex@example.test
PASSWORD='replace-with-a-long-password'

curl -sS "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"displayName\":\"Alex\"}"

TOKEN=$(curl -sS "$API/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq -r '.data.accessToken')

PROJECT_ID=$(curl -sS "$API/projects" -X POST -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"Launch plan"}' | jq -r '.data.project.id')

TASK_ID=$(curl -sS "$API/projects/$PROJECT_ID/tasks" -X POST -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"title":"Prepare checklist","description":"Track launch readiness"}' \
  | jq -r '.data.task.id')

curl -sS "$API/projects/$PROJECT_ID/tasks?status=OPEN&search=checklist" -H "authorization: Bearer $TOKEN"
```

## Upload an attachment directly to object storage

The returned URL and fields are short-lived capabilities. Keep them private and send the file as multipart form data to the URL; don't send the API bearer token to object storage.

```sh
UPLOAD=$(curl -sS "$API/projects/$PROJECT_ID/tasks/$TASK_ID/attachments" -X POST \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"fileName":"checklist.pdf","contentType":"application/pdf","sizeBytes":12345}')

ATTACHMENT_ID=$(echo "$UPLOAD" | jq -r '.data.attachment.id')
UPLOAD_URL=$(echo "$UPLOAD" | jq -r '.data.uploadUrl')

# Add each returned .data.uploadFields entry as a -F field, then add the file:
curl -sS "$UPLOAD_URL" -F 'key=<returned-key>' -F 'Content-Type=application/pdf' \
  -F 'policy=<returned-policy>' -F 'x-amz-algorithm=<returned-algorithm>' \
  -F 'x-amz-credential=<returned-credential>' -F 'x-amz-date=<returned-date>' \
  -F 'x-amz-signature=<returned-signature>' -F 'file=@checklist.pdf;type=application/pdf'

curl -sS "$API/projects/$PROJECT_ID/tasks/$TASK_ID/attachments/$ATTACHMENT_ID/complete" \
  -X POST -H "authorization: Bearer $TOKEN"
```

The exact signed form field names come from `uploadFields`; use the returned values verbatim. The API marks the attachment available only after verifying the stored object's size and content type.
