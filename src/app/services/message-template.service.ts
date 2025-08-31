import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MessageTemplateService {
  private acceptedTemplate: string = '';
  private rejectedTemplate: string = '';
  private templatesLoaded: boolean = false;

  constructor() {
    this.loadTemplates();
  }

  private async loadTemplates() {
    try {
      // Load template files from root directory
      const [acceptedResponse, rejectedResponse] = await Promise.all([
        fetch('/accepted.txt'),
        fetch('/rejected.txt')
      ]);

      if (acceptedResponse.ok) {
        this.acceptedTemplate = await acceptedResponse.text();
      }
      if (rejectedResponse.ok) {
        this.rejectedTemplate = await rejectedResponse.text();
      }
      
      this.templatesLoaded = true;
    } catch (error) {
      console.error('Failed to load email templates:', error);
      // Fallback to default templates if files can't be loaded
      this.setFallbackTemplates();
      this.templatesLoaded = true;
    }
  }

  private setFallbackTemplates() {
    this.acceptedTemplate = `Subject: Welcome to the Alpha-Bet Entrepreneurship School
Dear [Applicant Name],
We are excited to inform you that your application to the Alpha-Bet Program has been ACCEPTED. Welcome to [Class A/Class B], set to begin on Thursday, October 16th, 2025.

Application ID: [applicationId]
Operator ID: [operatorId]
Assigned Class: [className]`;

    this.rejectedTemplate = `Subject: Application Decision – Alpha-Bet Entrepreneurship School
Dear [Applicant Name],
Thank you for your interest in the Alpha-Bet Program. After careful consideration, we regret to inform you that we are unable to offer you a place in this semester.

Application ID: [applicationId]
Operator ID: [operatorId]`;
  }

  async waitForTemplates(): Promise<void> {
    while (!this.templatesLoaded) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async getAcceptedMessage(data: {
    firstName: string;
    lastName: string;
    className: string;
    classDays: string;
    classSchedule: string;
    applicationId: string;
    operatorId: string;
  }): Promise<{subject: string, body: string}> {
    await this.waitForTemplates();
    return this.processTemplate(this.acceptedTemplate, data);
  }

  async getRejectedMessage(data: {
    firstName: string;
    lastName: string;
    applicationId: string;
    operatorId: string;
  }): Promise<{subject: string, body: string}> {
    await this.waitForTemplates();
    return this.processTemplate(this.rejectedTemplate, data);
  }

  private processTemplate(template: string, data: Record<string, string>): {subject: string, body: string} {
    const lines = template.split('\n');
    const subjectLine = lines.find(line => line.startsWith('Subject:'));
    const subject = subjectLine ? subjectLine.replace('Subject:', '').trim() : 'Alpha-Bet Program Update';
    
    // Remove subject line from body
    const bodyLines = lines.filter(line => !line.startsWith('Subject:'));
    let body = bodyLines.join('\n').trim();
    
    // Replace variables in both subject and body
    const processedSubject = this.replaceTemplateVars(subject, data);
    const processedBody = this.replaceTemplateVars(body, data);
    
    return {
      subject: processedSubject,
      body: processedBody
    };
  }

  private replaceTemplateVars(template: string, data: Record<string, string>): string {
    let result = template;
    
    // Replace square bracket variables [Applicant Name] -> firstName lastName
    result = result.replace(/\[Applicant Name\]/g, `${data['firstName']} ${data['lastName']}`);
    result = result.replace(/\[Class A\/Class B\]/g, data['className'] || 'Your Class');
    result = result.replace(/\[Monday\/Tuesday\]/g, data['classDays'] || 'Class Days');
    result = result.replace(/\[applicationId\]/g, data['applicationId'] || '');
    result = result.replace(/\[operatorId\]/g, data['operatorId'] || '');
    result = result.replace(/\[className\]/g, data['className'] || '');
    
    // Replace curly brace variables {firstName} etc
    Object.keys(data).forEach(key => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, 'g'), data[key] || '');
    });
    
    return result;
  }
}