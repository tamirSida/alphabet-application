const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

/**
 * Resolve attachments into the shape Resend expects.
 * Each incoming attachment may be one of:
 *   - { filename, file }    -> a repo-relative path (e.g. "public/email-attachments/x.pdf")
 *                              that we read from disk and base64-encode server-side.
 *   - { filename, content } -> already base64, passed straight through.
 *   - { filename, path }    -> a hosted URL Resend will fetch itself.
 * A `file` that can't be read is skipped (logged) so the email still sends.
 */
function resolveAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  const resolved = [];
  for (const att of attachments) {
    if (att && att.file) {
      // included_files in netlify.toml preserves the repo-relative path; cwd is
      // the bundle root both under `netlify dev` and in production.
      const candidates = [
        path.join(process.cwd(), att.file),
        path.join(__dirname, '..', '..', att.file)
      ];
      const found = candidates.find(p => fs.existsSync(p));
      if (!found) {
        console.error('Attachment file not found, skipping:', att.file);
        continue;
      }
      resolved.push({
        filename: att.filename || path.basename(found),
        content: fs.readFileSync(found).toString('base64')
      });
    } else if (att && (att.content || att.path)) {
      resolved.push(att);
    }
  }
  return resolved;
}

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    };
  }

  try {
    const emailData = JSON.parse(event.body);
    
    // Validate required fields
    if (!emailData.to || !emailData.subject || (!emailData.html && !emailData.text)) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Missing required email fields' })
      };
    }

    // Get Resend API key from environment
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Email service not configured' })
      };
    }

    // Read any local-file attachments off disk and base64-encode them.
    const attachments = resolveAttachments(emailData.attachments);

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        ...(emailData.html ? { html: emailData.html } : { text: emailData.text }),
        ...(attachments.length ? { attachments } : {})
      })
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: result.message || result.error || 'Failed to send email',
          details: result
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Email function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};