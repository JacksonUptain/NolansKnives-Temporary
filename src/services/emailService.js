import { httpsCallable } from "firebase/functions";
import { functions } from "../pages/firebase";
import { showToast } from "../components/Toast";

/**
 * Email notification service
 * Handles all email communications through Cloud Functions
 */

const notifyCustomRequestSubmitted = httpsCallable(
  functions,
  "notifyCustomRequestSubmitted"
);
const notifyQuoteSent = httpsCallable(functions, "notifyQuoteSent");
const notifyStatusChange = httpsCallable(functions, "notifyStatusChange");
const notifyOrderComplete = httpsCallable(functions, "notifyOrderComplete");

export const emailService = {
  /**
   * Send custom request submission confirmation email
   */
  async sendRequestConfirmation(requestId, customerName, estimatedPrice, customerEmail) {
    try {
      await notifyCustomRequestSubmitted({
        requestId,
        customerName,
        estimatedPrice,
        customerEmail
      });
      showToast("Confirmation email sent to customer", "success");
      return { success: true };
    } catch (error) {
      console.error("Error sending request confirmation:", error);
      showToast("Could not send confirmation email", "warning");
      return { success: false, error };
    }
  },

  /**
   * Send quote to customer
   */
  async sendQuote(requestId, customerUid, customerName, customerEmail, finalPrice, depositAmount) {
    try {
      await notifyQuoteSent({
        requestId,
        customerUid,
        customerName,
        customerEmail,
        finalPrice,
        depositAmount
      });
      return { success: true };
    } catch (error) {
      console.error("Error sending quote:", error);
      return { success: false, error };
    }
  },

  /**
   * Notify customer of status change
   */
  async sendStatusUpdate(requestId, newStatus, customerName, customerEmail, message = "") {
    try {
      await notifyStatusChange({
        requestId,
        newStatus,
        customerName,
        customerEmail,
        message
      });
      showToast("Status update email sent", "success");
      return { success: true };
    } catch (error) {
      console.error("Error sending status update:", error);
      showToast("Could not send status email", "warning");
      return { success: false, error };
    }
  },

  /**
   * Notify customer that order is complete and shipped
   */
  async sendOrderComplete(requestId, customerName, customerEmail, trackingNumber = "") {
    try {
      await notifyOrderComplete({
        requestId,
        customerName,
        customerEmail,
        trackingNumber
      });
      showToast("Shipment notification sent", "success");
      return { success: true };
    } catch (error) {
      console.error("Error sending order complete email:", error);
      showToast("Could not send shipment notification", "warning");
      return { success: false, error };
    }
  }
};

export default emailService;
