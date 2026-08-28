import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
import { Application } from '../models/application.model';
import { Cohort } from '../models/cohort.model';
import { MessageTemplateService } from './message-template.service';
import { scheduleDays, scheduleTime, scheduleFirstOccurrence } from './schedule-format.util';
import { PROGRAM_TIME_ZONE, formatLongDateInZone } from './timezone.util';
import { environment } from '../../environments/environment';

export interface EmailConfig {
  fromEmail: string;
  apiUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private config: EmailConfig = {
    fromEmail: environment.resend.fromEmail,
    apiUrl: environment.emailApiUrl
  };

  constructor(private messageTemplateService: MessageTemplateService) {
    // Validate configuration on startup
    if (!this.config.apiUrl) {
      console.error('Email API URL not found in environment configuration!');
    }
  }

  /**
   * Send acceptance email to a user
   */
  async sendAcceptanceEmail(
    user: User, 
    application: Application, 
    cohort: Cohort
  ): Promise<void> {
    try {
      // Pull the assigned class's own schedule + the cohort-wide lab schedule so
      // the email reflects the actual assignment (works for single- or multi-class
      // cohorts — the assigned class is simply the only class when there's one).
      const assignedClassInfo = cohort.classes?.find(c => c.name === application.assignedClass);
      // Every schedule string is anchored to the date that session first runs,
      // so DST is resolved against the real date rather than a fixed offset.
      const classDays = scheduleDays(assignedClassInfo?.weeklySchedule, true);
      const lessonTime = scheduleTime(assignedClassInfo?.weeklySchedule, cohort.cohortStartDate);
      const labDays = scheduleDays(cohort.lab?.weeklySchedule, true);
      const labTime = scheduleTime(cohort.lab?.weeklySchedule, cohort.cohortStartDate);
      const classStartDate = this.getClassStartDate(cohort, application.assignedClass);

      const templateData = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        className: application.assignedClass || '',
        classDays: classDays,
        lessonTime: lessonTime,
        labDays: labDays,
        labTime: labTime,
        classStartDate: classStartDate,
        applicationId: application.applicationId,
        operatorId: user.operatorId
      };
      
      const {subject, body} = await this.messageTemplateService.getAcceptedMessage(templateData);

      // Operator Handbook is bundled with the Netlify function (see netlify.toml
      // included_files). The function reads it from disk and base64-encodes it
      // server-side; `filename` is what the recipient sees.
      const attachmentFile = 'Alpha-Bet Operator-Handbook-[Class 003].pdf';

      const emailData = {
        from: this.config.fromEmail,
        to: user.email,
        subject: subject,
        html: body,
        attachments: [{
          file: `public/email-attachments/${attachmentFile}`,
          filename: attachmentFile
        }]
      };

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to send email');
      }

      const result = await response.json();
      console.log('Acceptance email sent successfully:', result);
    } catch (error) {
      console.error('Failed to send acceptance email:', error);
      throw new Error(`Failed to send acceptance email to ${user.email}`);
    }
  }

  /**
   * Send rejection email to a user
   */
  async sendRejectionEmail(
    user: User, 
    application: Application,
    cohort: Cohort
  ): Promise<void> {
    try {
      const templateData = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        applicationId: application.applicationId,
        operatorId: user.operatorId
      };
      
      const {subject, body} = await this.messageTemplateService.getRejectedMessage(templateData);
      
      const emailData = {
        from: this.config.fromEmail,
        to: user.email,
        subject: subject,
        text: body
      };

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || errorData.error || 'Failed to send email');
      }

      const result = await response.json();
      console.log('Rejection email sent successfully:', result);
    } catch (error) {
      console.error('Failed to send rejection email:', error);
      throw new Error(`Failed to send rejection email to ${user.email}`);
    }
  }

  /**
   * Convert plain text to HTML with basic styling
   */
  private convertToHTML(text: string): string {
    // Convert plain text to HTML with basic formatting
    const styledText = text
      .replace(/\n\n/g, '</p><p>')  // Double line breaks become paragraph breaks
      .replace(/\n/g, '<br>')       // Single line breaks become <br> tags
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
      .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alphabet Program</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto;">
        <h1>Alphabet Program</h1>
        <h3>Application Update</h3>
        
        <div>
            ${styledText}
        </div>
        
        <hr style="margin: 30px 0;">
        
        <p style="font-size: 12px; text-align: center;">
            © 2024 Alphabet Program | support@alphabet.versionbravo.com<br>
            For questions, please contact our team
        </p>
    </div>
</body>
</html>`;
  }

  /**
   * Resolve the start date for a specific class within a cohort.
   *
   * The cohort has a single cohortStartDate; this returns the first occurrence
   * of the assigned class's primary day-of-week on or after it. Both the
   * day-of-week comparison and the formatting happen in PROGRAM_TIME_ZONE, so
   * the announced date no longer depends on where the admin's browser is.
   */
  private getClassStartDate(cohort: Cohort, assignedClass?: string): string {
    if (!cohort?.cohortStartDate) return 'TBD';

    const classInfo = assignedClass
      ? cohort.classes?.find(c => c.name === assignedClass)
      : undefined;

    const occurrence = scheduleFirstOccurrence(
      classInfo?.weeklySchedule,
      cohort.cohortStartDate
    );

    // No class schedule to key off — fall back to the cohort's own start date.
    const target = occurrence ?? (cohort.cohortStartDate instanceof Date
      ? cohort.cohortStartDate
      : new Date(cohort.cohortStartDate));

    return isNaN(target.getTime())
      ? 'TBD'
      : formatLongDateInZone(target, PROGRAM_TIME_ZONE);
  }

  /**
   * Test Postmark configuration
   */
  async testEmailConfig(): Promise<boolean> {
    try {
      const testEmail = {
        From: this.config.fromEmail,
        To: 'test@example.com',
        Subject: 'Postmark Configuration Test',
        HtmlBody: '<p>This is a test email from Postmark.</p>',
        MessageStream: 'outbound'
      };

      // This is just a config validation - don't actually send
      console.log('Postmark configuration ready:', this.config);
      return true;
    } catch (error) {
      console.error('Postmark configuration test failed:', error);
      return false;
    }
  }

}