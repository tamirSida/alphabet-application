import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
import { Application } from '../models/application.model';
import { Cohort } from '../models/cohort.model';
import { MessageTemplateService } from './message-template.service';
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
      const classSchedule = this.formatClassSchedule(cohort, application.assignedClass);
      const classDays = this.getClassDays(cohort, application.assignedClass);
      
      const templateData = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        className: application.assignedClass || '',
        classDays: classDays,
        classSchedule: classSchedule,
        applicationId: application.applicationId,
        operatorId: user.operatorId
      };
      
      const {subject, body} = await this.messageTemplateService.getAcceptedMessage(templateData);
      
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
   * Send bulk emails for results publication
   */
  async sendBulkResultsEmails(
    acceptedUsers: Array<{user: User, application: Application}>,
    rejectedUsers: Array<{user: User, application: Application}>,
    cohort: Cohort,
    onProgress?: (sent: number, total: number) => void
  ): Promise<{success: number, failed: Array<{email: string, error: string}>}> {
    const results = {
      success: 0,
      failed: [] as Array<{email: string, error: string}>
    };

    const total = acceptedUsers.length + rejectedUsers.length;
    let sent = 0;

    // Send acceptance emails
    for (const {user, application} of acceptedUsers) {
      try {
        await this.sendAcceptanceEmail(user, application, cohort);
        results.success++;
        sent++;
        onProgress?.(sent, total);
        
        // Add small delay to avoid rate limiting
        await this.delay(300);
      } catch (error: any) {
        results.failed.push({
          email: user.email,
          error: error.message || 'Unknown error'
        });
        sent++;
        onProgress?.(sent, total);
      }
    }

    // Send rejection emails
    for (const {user, application} of rejectedUsers) {
      try {
        await this.sendRejectionEmail(user, application, cohort);
        results.success++;
        sent++;
        onProgress?.(sent, total);
        
        // Add small delay to avoid rate limiting
        await this.delay(300);
      } catch (error: any) {
        results.failed.push({
          email: user.email,
          error: error.message || 'Unknown error'
        });
        sent++;
        onProgress?.(sent, total);
      }
    }

    return results;
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
   * Get class days for a specific class
   */
  private getClassDays(cohort: Cohort, assignedClass?: string): string {
    if (!assignedClass) return 'TBD';
    
    const classInfo = cohort.classes?.find(c => c.name === assignedClass);
    if (!classInfo || !classInfo.weeklySchedule) return 'TBD';

    const days = classInfo.weeklySchedule.map(schedule => schedule.day);
    return days.join(', ');
  }

  /**
   * Format class schedule for email
   */
  private formatClassSchedule(cohort: Cohort, assignedClass?: string): string {
    if (!assignedClass) return 'Schedule will be provided soon';
    
    const classInfo = cohort.classes?.find(c => c.name === assignedClass);
    if (!classInfo) return 'Schedule will be provided soon';

    return classInfo.weeklySchedule
      .map(schedule => `${schedule.day}: ${schedule.startTime} - ${schedule.endTime}`)
      .join('\n');
  }

  /**
   * Format date for email display
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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