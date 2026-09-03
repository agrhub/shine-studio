import nodemailer from 'nodemailer';
import { Logger } from '../utils/logger.js';
import { EnvConfig } from '@/config/env.js';

export class EmailService {
  private transporter: nodemailer.Transporter | undefined;
  private fromEmail: string | undefined;
  
  constructor() {
    const smtp = EnvConfig.smtp;
    
    if (smtp.enabled || smtp.host) {
      this.transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.ssl,
        auth: {
          user: smtp.senderEmail,
          pass: smtp.password,
        }
      });
      Logger.info('[EmailService] Configured with real SMTP');
      this.fromEmail = `${smtp.senderName} <${smtp.senderEmail}>`;
    } else {
      Logger.info('[EmailService] Configured with mock Ethereal SMTP (Test Mode)');
    }
  }

  public async sendPasswordRecovery(email: string, resetToken: string) {
    const resetUrl = `${EnvConfig.appUrl}/reset-password?token=${resetToken}`;
    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: 'Password Recovery - Shine Studio',
      text: `Hello, you requested a password reset. Click the following link: ${resetUrl}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Password Recovery</h2>
          <p>Hello,</p>
          <p>You recently requested to reset your password for your Shine Studio account.</p>
          <p><a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        </div>
      `
    };
    
    await this.sendMail(mailOptions);
  }

  public async sendOtpEmail(email: string, otp: string, purpose: 'enable_2fa' | 'disable_2fa' | 'login' | 'signup') {
    const titles = {
      'enable_2fa': 'Enable Two-Factor Authentication (2FA)',
      'disable_2fa': 'Disable Two-Factor Authentication (2FA)',
      'login': 'Two-Factor Authentication Sign In Verification',
      'signup': 'Confirm Your Email Address & Activate Account',
    };

    const actionText = {
      'enable_2fa': 'enable Two-Factor Authentication for your Shine Studio account',
      'disable_2fa': 'disable Two-Factor Authentication for your Shine Studio account',
      'login': 'sign in to your Shine Studio account',
      'signup': 'verify your email address and activate your Shine Studio account',
    };

    const title = titles[purpose] || 'Security Verification Code';
    const action = actionText[purpose] || 'verify your identity';

    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: `${otp} is your verification code - Shine Studio`,
      text: `Your Shine Studio verification code is: ${otp}. It will expire in 5 minutes.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #0f1015; color: #f3f4f6; border-radius: 16px; border: 1px solid #27272a;">
          <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <div style="width: 36px; height: 36px; background: #00dc82; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; color: #000; font-size: 20px; line-height: 36px; text-align: center;">S</div>
            <span style="font-size: 20px; font-weight: 800; margin-left: 12px; color: #fff; letter-spacing: -0.5px;">Shine<span style="color: #00dc82;">.</span></span>
          </div>

          <h2 style="color: #fff; font-size: 22px; font-weight: 700; margin: 0 0 12px 0;">${title}</h2>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.5; margin: 0 0 24px 0;">
            Use the 6-digit security code below to ${action}. This code will expire in <strong style="color: #fff;">5 minutes</strong>.
          </p>

          <div style="background: #18181b; border: 1px dashed #3f3f46; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00dc82;">${otp}</span>
          </div>

          <p style="color: #6b7280; font-size: 12px; line-height: 1.5; margin: 24px 0 0 0; border-top: 1px solid #27272a; padding-top: 16px;">
            If you did not request this verification code, please ignore this email or update your password immediately to protect your studio account.
          </p>
        </div>
      `
    };

    await this.sendMail(mailOptions);
  }

  public async sendWelcomeEmail(email: string, name: string) {
    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: 'Welcome to Shine Studio!',
      text: `Hello ${name}, welcome to Shine Studio! Get ready to create amazing viral micro-dramas.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Welcome, ${name}!</h2>
          <p>We're thrilled to have you onboard.</p>
          <p>Shine Studio is the premier AI platform for crafting high-retention vertical videos.</p>
          <p>Get started now and create your first episode!</p>
        </div>
      `
    };
    
    await this.sendMail(mailOptions);
  }

  public async sendUserNotification(email: string, type: 'credit' | 'balance' | 'share' | 'render' | 'publish', metadata: any) {
    const subjects = {
      'credit': 'Credits Updated',
      'balance': 'Low Balance Warning',
      'share': 'A Project Was Shared With You',
      'render': 'Your Episode Finished Rendering',
      'publish': 'Your Video is Live!'
    };
    
    const mailOptions = {
      from: this.fromEmail,
      to: email,
      subject: `${subjects[type]} - Shine Studio`,
      text: `Notification: ${type} - ${JSON.stringify(metadata)}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>${subjects[type]}</h2>
          <pre>${JSON.stringify(metadata, null, 2)}</pre>
        </div>
      `
    };
    
    await this.sendMail(mailOptions);
  }

  public async sendAdminSystemAlert(serviceName: string, errorMessage: string, stack?: string) {
    const adminEmail = EnvConfig.adminEmail;
    const timeStr = new Date().toISOString();
    const mailOptions = {
      from: this.fromEmail,
      to: adminEmail,
      subject: `[CRITICAL ALERT] ${serviceName} Failure`,
      text: `Service: ${serviceName}\nTime: ${timeStr}\n\nError Message:\n${errorMessage}\n\n${stack ? `Stack Trace:\n${stack}\n\n` : ''}Please check the server logs (Grafana/OpenTelemetry) immediately.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; line-height: 1.6; color: #1f2937; background: #ffffff; padding: 24px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <div style="display: flex; align-items: center; margin-bottom: 16px;">
            <h2 style="color: #dc2626; margin: 0; font-size: 20px; font-weight: 700;">Critical System Alert</h2>
          </div>
          <div style="margin-bottom: 16px; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Service:</strong> <span style="color: #4b5563;">${serviceName}</span></p>
            <p style="margin: 4px 0;"><strong>Time:</strong> <span style="color: #4b5563;">${timeStr}</span></p>
          </div>
          
          <p style="margin: 16px 0 8px 0; font-weight: 600; font-size: 14px; color: #111827;">Error Message:</p>
          <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-left: 4px solid #dc2626; border-radius: 6px; padding: 12px; margin-bottom: 16px;">
            <pre style="margin: 0; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; color: #991b1b;">${errorMessage}</pre>
          </div>

          ${stack ? `
          <p style="margin: 16px 0 8px 0; font-weight: 600; font-size: 14px; color: #111827;">Stack Trace:</p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-bottom: 16px; overflow-x: auto;">
            <pre style="margin: 0; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #334155; line-height: 1.5;">${stack}</pre>
          </div>
          ` : ''}

          <p style="color: #6b7280; font-size: 13px; margin: 20px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 12px;">
            Please check server telemetry & logs (Grafana / OpenTelemetry) immediately.
          </p>
        </div>
      `
    };
    
    await this.sendMail(mailOptions);
  }

  private async sendMail(options: nodemailer.SendMailOptions) {
    try {
      if(!this.transporter){
        Logger.warn(`[EmailService] SMTP not configured, skip send to ${options.to}`);
        return;
      }
      const info = await this.transporter.sendMail(options);
      Logger.info(`[EmailService] Sent email to ${options.to}. MessageId: ${info.messageId}`);
      if (info.messageId && !EnvConfig.smtp.enabled) {
        Logger.info(`[EmailService] Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      }
    } catch (err: any) {
      Logger.error(`[EmailService] Failed to send email to ${options.to}: ${err.message}`);
    }
  }
}

export const emailService = new EmailService();
