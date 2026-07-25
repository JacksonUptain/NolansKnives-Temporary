import React from 'react';
import { Link } from 'react-router-dom';
import LucideIcon from '../../components/ui/LucideIcon';

const steps = [
  {
    number: '01',
    title: 'Publish available work',
    description: 'Create the product, add strong photos and specifications, set availability, preview it, then publish it to the store or gallery.',
    action: 'Open products',
    href: '/business/products',
    icon: 'Package'
  },
  {
    number: '02',
    title: 'Review incoming work',
    description: 'Check paid store orders and new custom briefs. Unread messages and requests needing review are surfaced on the overview.',
    action: 'Review custom requests',
    href: '/business/custom-requests',
    icon: 'ClipboardCheck'
  },
  {
    number: '03',
    title: 'Quote custom builds',
    description: 'Confirm the design, final price, deposit, and notes. Send the quote from the request so the customer receives the correct next step.',
    action: 'Open quote queue',
    href: '/business/quotes',
    icon: 'FileText'
  },
  {
    number: '04',
    title: 'Build and communicate',
    description: 'Move accepted work through production, use messages for updates or questions, and request the final balance when the knife is ready.',
    action: 'Open production',
    href: '/business/production',
    icon: 'Hammer'
  },
  {
    number: '05',
    title: 'Finish and deliver',
    description: 'Confirm payment, record tracking or pickup details, move the order to shipped or delivered, and leave the customer with a clear final status.',
    action: 'Open fulfillment',
    href: '/business/fulfillment',
    icon: 'Truck'
  }
];

export default function Workflow() {
  return (
    <div className="business-workspace workflow-page">
      <div className="workspace-hero">
        <div>
          <h1>Nolan&apos;s Workflow</h1>
          <p>A simple path from a finished knife or customer idea to payment, production, communication, and delivery.</p>
        </div>
        <Link className="action-btn workspace-primary-action" to="/business/products/new"><LucideIcon name="Plus" size={16} /> Add a knife</Link>
      </div>

      <div className="workflow-steps">
        {steps.map((step) => (
          <article className="workflow-step" key={step.number}>
            <div className="workflow-step-number">{step.number}</div>
            <div className="workflow-step-icon"><LucideIcon name={step.icon} size={22} /></div>
            <div>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
              <Link to={step.href}>{step.action} <LucideIcon name="ArrowRight" size={15} /></Link>
            </div>
          </article>
        ))}
      </div>

      <section className="workflow-safety">
        <LucideIcon name="ShieldCheck" size={24} />
        <div>
          <h2>The site handles the handoffs</h2>
          <p>Store purchases create an order and conversation. Custom requests carry the brief into quoting, deposit, production, final payment, and delivery. Status emails and customer account updates keep both sides aligned.</p>
        </div>
      </section>
    </div>
  );
}
