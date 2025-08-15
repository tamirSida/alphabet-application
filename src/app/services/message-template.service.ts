import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MessageTemplateService {
  private acceptedTemplate = `🎉 Congratulations! Your Application Has Been Accepted! 🎉

Dear {firstName} {lastName},

We are thrilled to inform you that your application for the Alphabet Program has been ACCEPTED! Welcome to {className}!

📅 CLASS SCHEDULE:
Your class will be conducted on: {classDays}
Class times: {classSchedule}

🚀 NEXT STEPS:
1. You will receive detailed onboarding information via email within 48 hours
2. Please confirm your attendance by replying to the upcoming email
3. Prepare for an exciting journey of learning and growth!

We're excited to have you join our program and look forward to seeing you achieve great things.

Best regards,
The Alphabet Program Team

---
Application ID: {applicationId}
Operator ID: {operatorId}
Assigned Class: {className}`;

  private rejectedTemplate = `Application Status Update

Dear {firstName} {lastName},

Thank you for your interest in the Alphabet Program and for taking the time to submit your application.

After careful review of all applications, we regret to inform you that we are unable to offer you a place in the current cohort. This decision was extremely difficult given the high quality of applications we received.

Please know that this decision does not reflect your potential or capabilities. We encourage you to:

• Continue developing your skills and experience
• Consider applying for future cohorts when available
• Stay connected with our community for updates and opportunities

We appreciate your understanding and wish you all the best in your future endeavors.

Best regards,
The Alphabet Program Admissions Team

---
Application ID: {applicationId}
Operator ID: {operatorId}
Review Date: {reviewDate}`;

  getAcceptedMessage(data: {
    firstName: string;
    lastName: string;
    className: string;
    classDays: string;
    classSchedule: string;
    applicationId: string;
    operatorId: string;
  }): string {
    return this.replaceTemplateVars(this.acceptedTemplate, data);
  }

  getRejectedMessage(data: {
    firstName: string;
    lastName: string;
    applicationId: string;
    operatorId: string;
    reviewDate: string;
  }): string {
    return this.replaceTemplateVars(this.rejectedTemplate, data);
  }

  private replaceTemplateVars(template: string, data: Record<string, string>): string {
    let result = template;
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), data[key] || '');
    });
    return result;
  }
}