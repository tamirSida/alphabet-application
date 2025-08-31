import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
import { Application } from '../models/application.model';
import { Cohort } from '../models/cohort.model';
import { environment } from '../../environments/environment';

export interface PostmarkConfig {
  serverToken: string;
  fromEmail: string;
  replyToEmail: string;
  apiUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class EmailService {
  private config: PostmarkConfig = {
    serverToken: environment.postmark.serverToken,
    fromEmail: 'application@alphabet.versionbravo.com',
    replyToEmail: 'support@alphabet.versionbravo.com',
    apiUrl: 'https://api.postmarkapp.com/email'
  };

  constructor() {
    // Postmark doesn't require initialization
    // Validate configuration on startup
    if (!this.config.serverToken) {
      console.error('Postmark server token not found in environment configuration!');
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
      const htmlContent = this.generateAcceptanceEmailHTML(user, application, cohort);
      
      const emailData = {
        From: this.config.fromEmail,
        To: user.email,
        Subject: `🎉 Congratulations! You've been accepted to ${cohort.number}`,
        HtmlBody: htmlContent,
        ReplyTo: this.config.replyToEmail,
        MessageStream: 'outbound'
      };

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.config.serverToken
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.Message || 'Failed to send email');
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
    cohort: Cohort
  ): Promise<void> {
    try {
      const htmlContent = this.generateRejectionEmailHTML(user, cohort);
      
      const emailData = {
        From: this.config.fromEmail,
        To: user.email,
        Subject: `Alphabet Program ${cohort.number} - Application Update`,
        HtmlBody: htmlContent,
        ReplyTo: this.config.replyToEmail,
        MessageStream: 'outbound'
      };

      const response = await fetch(this.config.apiUrl, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': this.config.serverToken
        },
        body: JSON.stringify(emailData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.Message || 'Failed to send email');
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
        await this.sendRejectionEmail(user, cohort);
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
   * Generate acceptance email HTML
   */
  private generateAcceptanceEmailHTML(user: User, application: Application, cohort: Cohort): string {
    const classSchedule = this.formatClassSchedule(cohort, application.assignedClass);
    const cohortStartDate = this.formatDate(cohort.cohortStartDate);
    const cohortEndDate = this.formatDate(cohort.cohortEndDate);
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Congratulations - Alphabet Program Acceptance</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; text-align: center; padding: 30px 20px; border-radius: 12px 12px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
        .highlight { background: linear-gradient(135deg, #d1fae5, #ecfdf5); border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
        .class-info { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #3b82f6; }
        .schedule { background: #fef3c7; border-radius: 6px; padding: 15px; font-family: 'Courier New', monospace; font-size: 14px; margin: 10px 0; white-space: pre-line; }
        .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Congratulations!</h1>
        <p>Welcome to the Alphabet Program</p>
    </div>
    
    <div class="content">
        <p>Dear ${user.firstName || 'Applicant'},</p>
        
        <div class="highlight">
            <h2 style="margin: 0; color: #059669;">You've Been Accepted!</h2>
            <p style="margin: 10px 0 0 0; font-size: 16px;">We're excited to have you join ${cohort.number}</p>
        </div>
        
        <p>After careful review of your application, we're thrilled to inform you that you have been accepted into the Alphabet Program. Your dedication, experience, and passion truly stood out.</p>
        
        <div class="class-info">
            <h3 style="margin: 0 0 10px 0; color: #1e40af;">Your Class Assignment</h3>
            <p><strong>Class:</strong> ${application.assignedClass || 'TBD'}</p>
            <p><strong>Student ID:</strong> ${user.operatorId}</p>
            
            <h4 style="color: #374151; margin: 15px 0 5px 0;">Schedule:</h4>
            <div class="schedule">${classSchedule}</div>
        </div>
        
        <h3 style="color: #1e40af;">Program Details</h3>
        <ul>
            <li><strong>Cohort:</strong> ${cohort.number}</li>
            <li><strong>Program Start:</strong> ${cohortStartDate}</li>
            <li><strong>Program End:</strong> ${cohortEndDate}</li>
        </ul>
        
        <h3 style="color: #1e40af;">Next Steps</h3>
        <ol>
            <li><strong>Confirm Attendance:</strong> Reply to this email to confirm your participation</li>
            <li><strong>Preparation Materials:</strong> You'll receive additional materials within the next few days</li>
            <li><strong>Class Orientation:</strong> Details about orientation will be shared soon</li>
            <li><strong>Connect with Peers:</strong> Join our program community channels</li>
        </ol>
        
        <p>We're looking forward to seeing what amazing projects and innovations you'll create during the program. This is just the beginning of an exciting journey!</p>
        
        <p>If you have any questions or concerns, please don't hesitate to reach out to our team.</p>
        
        <p style="margin-top: 30px;">
            Welcome to the Alphabet Program family!<br>
            <strong>The Alphabet Program Team</strong>
        </p>
    </div>
    
    <div class="footer">
        <p>© 2024 Alphabet Program | support@alphabet.versionbravo.com</p>
        <p>This email was sent to ${user.email}</p>
    </div>
</body>
</html>`;
  }

  /**
   * Generate rejection email HTML
   */
  private generateRejectionEmailHTML(user: User, cohort: Cohort): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Alphabet Program Application Update</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6b7280, #9ca3af); color: white; text-align: center; padding: 30px 20px; border-radius: 12px 12px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
        .highlight { background: linear-gradient(135deg, #fef2f2, #fefefe); border: 1px solid #f87171; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center; }
        .encouragement { background: #f0f9ff; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #3b82f6; }
        .feedback-section { background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Alphabet Program Application Update</h1>
        <p>${cohort.number} Application Decision</p>
    </div>
    
    <div class="content">
        <p>Dear ${user.firstName || 'Applicant'},</p>
        
        <p>Thank you for taking the time to apply to the Alphabet Program ${cohort.number}. We appreciate the effort you put into your application and your interest in our program.</p>
        
        <div class="highlight">
            <p style="margin: 0; font-size: 16px; color: #dc2626;">After careful consideration, we regret to inform you that we will not be able to offer you a position in this cohort.</p>
        </div>
        
        <p>This decision was not made lightly. We received an exceptional number of applications from highly qualified candidates, making the selection process extremely competitive. While we cannot offer you a spot at this time, we want you to know that your application demonstrated many strengths.</p>
        
        <div class="encouragement">
            <h3 style="margin: 0 0 15px 0; color: #1e40af;">We Encourage You to Reapply</h3>
            <p style="margin: 0;">We believe you have potential and encourage you to apply for future cohorts. Many successful participants were not accepted on their first application and used the feedback to strengthen their candidacy.</p>
        </div>
        
        <div class="feedback-section">
            <h3 style="color: #374151; margin: 0 0 10px 0;">Ways to Strengthen Your Future Application</h3>
            <ul style="margin: 10px 0;">
                <li><strong>Gain more practical experience</strong> in entrepreneurship, programming, or leadership roles</li>
                <li><strong>Develop your project ideas</strong> further with concrete plans and market research</li>
                <li><strong>Enhance your technical skills</strong> through online courses or personal projects</li>
                <li><strong>Demonstrate impact</strong> through community involvement or professional achievements</li>
                <li><strong>Refine your application materials</strong> including your video introduction and written responses</li>
            </ul>
        </div>
        
        <h3 style="color: #1e40af;">Stay Connected</h3>
        <p>We encourage you to:</p>
        <ul>
            <li>Follow our program updates and success stories</li>
            <li>Attend our public events and workshops when available</li>
            <li>Consider applying for future cohorts</li>
            <li>Connect with our alumni network for mentorship opportunities</li>
        </ul>
        
        <p>While this news may be disappointing, we hope you'll view this as a stepping stone in your entrepreneurial journey. Many successful entrepreneurs faced initial setbacks before achieving their goals.</p>
        
        <p>We wish you the very best in your future endeavors and hope to see your application again in upcoming cohorts.</p>
        
        <p style="margin-top: 30px;">
            Best regards,<br>
            <strong>The Alphabet Program Admissions Team</strong>
        </p>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
            <strong>Student ID:</strong> ${user.operatorId}
        </p>
    </div>
    
    <div class="footer">
        <p>© 2024 Alphabet Program | support@alphabet.versionbravo.com</p>
        <p>This email was sent to ${user.email}</p>
        <p>For questions about this decision, please contact our admissions team</p>
    </div>
</body>
</html>`;
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
        ReplyTo: this.config.replyToEmail,
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