import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { customRequestService } from '../services/customRequestService';
import './CustomKnifeRequest.css';
import LucideIcon from '../components/ui/LucideIcon';
import { showToast } from '../components/Toast';

const KNIFE_OPTIONS = {
  knifeType: {
    label: 'Knife Type',
    options: [
      { id: 'chef', label: 'Chef Knife', price: 0 },
      { id: 'paring', label: 'Paring Knife', price: -50 },
      { id: 'utility', label: 'Utility Knife', price: -25 },
      { id: 'boning', label: 'Boning Knife', price: -30 },
      { id: 'filleting', label: 'Filleting Knife', price: -40 },
      { id: 'hunting', label: 'Hunting / Field Knife', price: 100 },
      { id: 'bushcraft', label: 'Bushcraft Knife', price: 150 },
      { id: 'custom', label: 'Other / Custom', price: 0 }
    ]
  },
  intendedUse: {
    label: 'Intended Use',
    options: [
      { id: 'kitchen', label: 'Kitchen / Culinary', price: 0 },
      { id: 'outdoor', label: 'Outdoor / Camping', price: 50 },
      { id: 'hunting', label: 'Hunting / Field Dressing', price: 75 },
      { id: 'collecting', label: 'Collecting / Display', price: 25 },
      { id: 'general', label: 'General Purpose', price: 0 }
    ]
  },
  bladeStyle: {
    label: 'Blade Style',
    options: [
      { id: 'straight', label: 'Straight Edge', price: 0 },
      { id: 'serrated', label: 'Serrated Edge', price: 50 },
      { id: 'tanto', label: 'Tanto Point', price: 75 },
      { id: 'drop', label: 'Drop Point', price: 50 },
      { id: 'clip', label: 'Clip Point', price: 50 }
    ]
  },
  bladeSizeCategory: {
    label: 'Blade Size',
    options: [
      { id: 'small', label: 'Small, 2-3 inches', price: -100 },
      { id: 'medium', label: 'Medium, 3-5 inches', price: 0 },
      { id: 'large', label: 'Large, 5-8 inches', price: 100 },
      { id: 'xlarge', label: 'Extra Large, 8+ inches', price: 250 }
    ]
  },
  steelType: {
    label: 'Steel Preference',
    options: [
      { id: 'carbon', label: 'Carbon Steel', price: 0 },
      { id: 'stainless', label: 'Stainless Steel', price: 50 },
      { id: 'damascus', label: 'Damascus Steel', price: 300 },
      { id: 'highcarbon', label: 'High Carbon Stainless', price: 75 },
      { id: 'nodifference', label: 'No Preference', price: 0 }
    ]
  },
  handleMaterial: {
    label: 'Handle Material',
    options: [
      { id: 'wood', label: 'Wood', price: 0 },
      { id: 'micarta', label: 'Micarta', price: 50 },
      { id: 'g10', label: 'G-10', price: 60 },
      { id: 'bone', label: 'Bone', price: 40 },
      { id: 'horn', label: 'Horn', price: 75 },
      { id: 'leather', label: 'Leather Wrapped', price: 60 }
    ]
  },
  handleStyle: {
    label: 'Handle Style',
    options: [
      { id: 'full', label: 'Full Tang', price: 0 },
      { id: 'half', label: 'Half Tang', price: -50 },
      { id: 'hidden', label: 'Hidden Tang', price: 75 },
      { id: 'scaled', label: 'Scaled Handle', price: 50 }
    ]
  },
  finish: {
    label: 'Blade Finish',
    options: [
      { id: 'polished', label: 'Polished', price: 0 },
      { id: 'satin', label: 'Satin', price: 0 },
      { id: 'matte', label: 'Matte Black', price: 25 },
      { id: 'etched', label: 'Etched Pattern', price: 50 }
    ]
  }
};

const OPTION_DESCRIPTIONS = {
  knifeType: {
    chef: 'Balanced for prep work, slicing, and daily kitchen use.',
    paring: 'Compact detail work for fruit, trimming, and fine control.',
    utility: 'A nimble middle-ground knife for varied kitchen tasks.',
    boning: 'Slim profile for breaking down meat and trimming close to bone.',
    filleting: 'Flexible geometry for clean fish and protein work.',
    hunting: 'Durable field shape with extra grip and carrying confidence.',
    bushcraft: 'Hard-use outdoor build for carving, camp, and utility work.',
    custom: 'Start with an idea and let Nolan refine the shape with you.'
  },
  intendedUse: {
    kitchen: 'Optimized for prep flow, balance, and board feel.',
    outdoor: 'Built for durability, grip, and practical carry.',
    hunting: 'Designed around control, edge retention, and field cleanup.',
    collecting: 'Prioritizes visual character, finish, and display value.',
    general: 'A practical all-around build with room to adapt.'
  },
  bladeStyle: {
    straight: 'Clean, familiar geometry with easy sharpening.',
    serrated: 'Adds bite for fibrous material and tough crusts.',
    tanto: 'Strong tip profile with a distinctive tactical look.',
    drop: 'Reliable point control for field and everyday utility.',
    clip: 'A finer point with a classic custom-knife silhouette.'
  },
  bladeSizeCategory: {
    small: 'Compact and precise.',
    medium: 'The most versatile starting range.',
    large: 'More reach, more presence.',
    xlarge: 'Statement scale for specialty builds.'
  },
  steelType: {
    carbon: 'Traditional feel with excellent sharpening feedback.',
    stainless: 'Lower maintenance for daily use.',
    damascus: 'Layered patterning for a showpiece finish.',
    highcarbon: 'A balanced performance upgrade.',
    nodifference: 'Let Nolan recommend the best steel for the job.'
  },
  handleMaterial: {
    wood: 'Warm, natural, and timeless.',
    micarta: 'Stable, grippy, and shop-proven.',
    g10: 'Hard-wearing modern composite.',
    bone: 'Classic character and subtle variation.',
    horn: 'Distinct natural figure and polish.',
    leather: 'Comfortable texture with a heritage feel.'
  },
  handleStyle: {
    full: 'Maximum strength and a substantial hand feel.',
    half: 'Lighter in hand while keeping a traditional profile.',
    hidden: 'Clean silhouette with refined fit and finish.',
    scaled: 'Layered scales with strong visual detail.'
  },
  finish: {
    polished: 'Reflective, refined, and presentation-focused.',
    satin: 'Soft sheen that hides use gracefully.',
    matte: 'Low-glare, modern, and understated.',
    etched: 'Adds contrast, texture, and visual depth.'
  }
};

const BASE_PRICE = 250;
const DEPOSIT_PERCENTAGE = 0.15;
const STORAGE_KEY = 'nolans_custom_request_draft';

const INITIAL_FORM_DATA = {
  knifeType: '',
  intendedUse: '',
  bladeStyle: '',
  bladeSizeCategory: '',
  steelType: '',
  handleMaterial: '',
  handleStyle: '',
  finish: '',
  customSizeInches: '',
  engravingText: null,
  sheathRequested: false,
  referenceImages: [],
  additionalNotes: '',
  desiredCompletionDate: '',
  deliveryPreference: 'pickup'
};

const REQUIRED_FIELDS = [
  'knifeType',
  'intendedUse',
  'bladeStyle',
  'bladeSizeCategory',
  'steelType',
  'handleMaterial',
  'handleStyle',
  'additionalNotes'
];

const STEP_REQUIREMENTS = {
  1: ['knifeType', 'intendedUse'],
  2: ['bladeStyle', 'bladeSizeCategory', 'steelType'],
  3: ['handleMaterial', 'handleStyle'],
  4: ['additionalNotes'],
  5: [],
  6: []
};

const FIELD_TO_STEP = {
  knifeType: 1,
  intendedUse: 1,
  bladeStyle: 2,
  bladeSizeCategory: 2,
  steelType: 2,
  handleMaterial: 3,
  handleStyle: 3,
  additionalNotes: 4
};

function getOptionLabel(field, value) {
  if (!value) return 'Not selected';
  return KNIFE_OPTIONS[field]?.options.find((option) => option.id === value)?.label || 'Not selected';
}

function getSavedDraft() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function scrollRequestTop() {
  if (typeof window === 'undefined') return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function CustomKnifeRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isActiveUser } = useAuth();
  const savedDraft = useMemo(getSavedDraft, []);

  const [currentStep, setCurrentStep] = useState(() => {
    const savedStep = Number(savedDraft?.currentStep);
    return savedStep >= 1 && savedStep <= 6 ? savedStep : 1;
  });
  const [formData, setFormData] = useState(() => ({
    ...INITIAL_FORM_DATA,
    ...(savedDraft?.formData || {}),
    referenceImages: []
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitIntent, setSubmitIntent] = useState('');
  const [error, setError] = useState('');

  const isInactiveSignedIn = !!user && !isActiveUser;

  const steps = useMemo(
    () => [
      { number: 1, title: 'Knife Type' },
      { number: 2, title: 'Blade' },
      { number: 3, title: 'Handle' },
      { number: 4, title: 'Details' },
      { number: 5, title: 'Delivery' },
      { number: 6, title: 'Review' }
    ],
    []
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ currentStep, formData }));
  }, [currentStep, formData]);

  const estimatedPrice = useMemo(() => {
    let total = BASE_PRICE;

    Object.entries(KNIFE_OPTIONS).forEach(([field, group]) => {
      const selected = group.options.find((option) => option.id === formData[field]);
      if (selected) total += selected.price;
    });

    if (formData.engravingText && formData.engravingText.trim().length > 0) {
      total += 35;
    }

    if (formData.sheathRequested) {
      total += 75;
    }

    return Math.max(total, 100);
  }, [formData]);

  const depositAmount = useMemo(
    () => Number((estimatedPrice * DEPOSIT_PERCENTAGE).toFixed(2)),
    [estimatedPrice]
  );

  const progressPercent = ((currentStep - 1) / (steps.length - 1)) * 100;

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const validateStep = (stepNumber) => {
    const missing = (STEP_REQUIREMENTS[stepNumber] || []).filter((field) => !String(formData[field] || '').trim());
    if (missing.length > 0) {
      const labels = missing.map((field) => KNIFE_OPTIONS[field]?.label || field);
      return {
        valid: false,
        field: missing[0],
        message: `Choose ${labels.join(' and ')} before continuing.`
      };
    }

    if (stepNumber === 2 && formData.customSizeInches) {
      const size = Number(formData.customSizeInches);
      if (!Number.isFinite(size) || size <= 0) {
        return {
          valid: false,
          field: 'customSizeInches',
          message: 'Enter blade length as a positive number, or leave it blank.'
        };
      }
    }

    return { valid: true };
  };

  const validateForm = () => {
    const missing = REQUIRED_FIELDS.filter((field) => !String(formData[field] || '').trim());
    if (missing.length > 0) {
      const firstMissing = missing[0];
      return {
        valid: false,
        step: FIELD_TO_STEP[firstMissing] || 1,
        message: firstMissing === 'additionalNotes'
          ? 'Add custom instructions or general vibe notes before submitting.'
          : `Finish ${KNIFE_OPTIONS[firstMissing]?.label || 'the required choices'} before submitting.`
      };
    }

    const bladeValidation = validateStep(2);
    if (!bladeValidation.valid) {
      return { ...bladeValidation, step: 2 };
    }

    return { valid: true };
  };

  const goToStep = (stepNumber) => {
    if (stepNumber >= currentStep) return;
    setError('');
    setCurrentStep(stepNumber);
    scrollRequestTop();
  };

  const handleNext = () => {
    const validation = validateStep(currentStep);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    setError('');
    setCurrentStep((step) => Math.min(step + 1, steps.length));
    scrollRequestTop();
  };

  const handleSubmit = async (skipPayment = false) => {
    setError('');

    const validation = validateForm();
    if (!validation.valid) {
      setCurrentStep(validation.step || 1);
      setError(validation.message);
      scrollRequestTop();
      return;
    }

    if (!user?.uid) {
      showToast('Sign in to send your request.', 'info');
      navigate('/account', { state: { from: location.pathname + location.search } });
      return;
    }

    if (isInactiveSignedIn) {
      setError('This account needs help before it can send a request. Please contact Nolan\'s Knives.');
      return;
    }

    setSubmitIntent(skipPayment ? 'standard' : 'deposit');
    setIsSubmitting(true);

    try {
      const {
        requestId,
        estimatedPrice: finalEstimatedPrice,
        depositAmount: finalDepositAmount
      } = await customRequestService.createRequest({
        ...formData,
        skipPayment
      });

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      showToast(skipPayment ? 'Custom request sent.' : 'Request saved. Deposit is ready.', 'success');
      navigate(`/custom-knife/confirmation/${requestId}`, {
        replace: true,
        state: {
          isUnpaid: skipPayment,
          estimatedPrice: finalEstimatedPrice,
          depositAmount: finalDepositAmount,
          depositRequested: !skipPayment
        }
      });
    } catch (err) {
      console.error('Submit error:', err);
      const message = err?.message ? `Error submitting request: ${err.message}` : 'Error submitting request. Please try again.';
      setError(message);
      showToast(message, 'error');
      setIsSubmitting(false);
      setSubmitIntent('');
    }
  };

  const renderOptionGroup = (field, title, description) => (
    <section className="request-section" aria-labelledby={`${field}-heading`}>
      <div className="section-heading">
        <h3 id={`${field}-heading`}>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      <div className="options-grid">
        {KNIFE_OPTIONS[field].options.map((option, index) => {
          const selected = formData[field] === option.id;
          const optionDescription = OPTION_DESCRIPTIONS[field]?.[option.id];

          return (
            <button
              key={option.id}
              type="button"
              className={`option-card ${selected ? 'selected' : ''}`}
              style={{ '--option-index': index }}
              onClick={() => handleFieldChange(field, option.id)}
              aria-pressed={selected}
            >
              <span className="option-check" aria-hidden="true">
                <LucideIcon name={selected ? 'Check' : 'Plus'} size={15} />
              </span>
              <span className="option-label">{option.label}</span>
              {optionDescription && <span className="option-description">{optionDescription}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderReviewRow = (label, value) => (
    <div className="review-item">
      <span>{label}</span>
      <strong>{value || 'Not selected'}</strong>
    </div>
  );

  return (
    <div className="custom-request-container">
      {isSubmitting && (
        <div className="request-submit-overlay" role="status" aria-live="polite">
          <div className="submit-panel">
            <span className="spinner" aria-hidden="true" />
            <strong>{submitIntent === 'deposit' ? 'Preparing your deposit' : 'Sending your request'}</strong>
            <p>{submitIntent === 'deposit' ? 'Saving the request and opening the payment step.' : 'Saving your request for Nolan to review.'}</p>
          </div>
        </div>
      )}

      <div className="custom-request-wrapper">
        <section className="request-hero">
          <button type="button" className="request-back-link" onClick={() => navigate('/Store')}>
            <LucideIcon name="ArrowLeft" size={16} />
            Store
          </button>
          <p className="request-eyebrow">Nolan's Knives</p>
          <h1>Request a Custom Knife</h1>
          <p className="request-lede">
            Tell Nolan what you want made. Choose a starting shape, share the details that matter, and receive a final quote after review.
          </p>
        </section>

        <section className="request-progress-shell" aria-label="Request progress">
          <div
            className="step-indicator"
            style={{ '--progress': `${progressPercent}%` }}
          >
            {steps.map((step) => {
              const active = currentStep === step.number;
              const completed = currentStep > step.number;

              return (
                <button
                  key={step.number}
                  type="button"
                  className={`step-item ${active ? 'active' : ''} ${completed ? 'completed' : ''}`}
                  onClick={() => goToStep(step.number)}
                  disabled={!completed && !active}
                  aria-current={active ? 'step' : undefined}
                >
                  <span className="step-circle" aria-hidden="true">
                    <span className="step-number">{step.number}</span>
                  </span>
                  <span className="step-label">{step.title}</span>
                </button>
              );
            })}
          </div>
          <div className="mobile-progress">
            <span>Step {currentStep} of {steps.length}</span>
            <strong>{steps[currentStep - 1].title}</strong>
          </div>
        </section>

        {error && (
          <div className="alert-error" role="alert">
            <LucideIcon name="CircleAlert" size={18} />
            <span>{error}</span>
          </div>
        )}

        {!user && (
          <div className="auth-note">
            <LucideIcon name="LockKeyhole" size={20} />
            <div>
              <strong>Start here, send it when you're ready.</strong>
              <span>You can fill out the request first. Sign in only when you are ready to send it.</span>
            </div>
            <button type="button" onClick={() => navigate('/account', { state: { from: location.pathname + location.search } })}>
              Sign in
            </button>
          </div>
        )}

        {isInactiveSignedIn && (
          <div className="auth-note warning">
            <LucideIcon name="ShieldAlert" size={20} />
            <div>
              <strong>Account review needed.</strong>
              <span>This account cannot submit a request until support reactivates it.</span>
            </div>
          </div>
        )}

        <div className="request-form-container">
          <main className="request-main">
            {currentStep === 1 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 1</span>
                  <h2>Start with the shape and purpose.</h2>
                  <p>These choices set the direction for pricing, balance, and materials.</p>
                </div>
                {renderOptionGroup('knifeType', 'Knife type', 'Choose the closest starting point for the build.')}
                {renderOptionGroup('intendedUse', 'Primary use', 'Tell Nolan how the knife will actually be used.')}
              </div>
            )}

            {currentStep === 2 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 2</span>
                  <h2>Dial in the blade.</h2>
                  <p>Pick the working profile, size range, and steel preference.</p>
                </div>
                {renderOptionGroup('bladeStyle', 'Blade style')}
                {renderOptionGroup('bladeSizeCategory', 'Blade size')}

                <section className="request-section">
                  <div className="section-heading">
                    <h3>Specific length</h3>
                    <p>Optional. Add an exact blade length if you already know it.</p>
                  </div>
                  <label className="form-field" htmlFor="customSizeInches">
                    <span>Blade length in inches</span>
                    <input
                      id="customSizeInches"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.25"
                      placeholder="4.5"
                      value={formData.customSizeInches}
                      onChange={(event) => handleFieldChange('customSizeInches', event.target.value)}
                    />
                  </label>
                </section>

                {renderOptionGroup('steelType', 'Steel preference')}
              </div>
            )}

            {currentStep === 3 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 3</span>
                  <h2>Choose the handle feel.</h2>
                  <p>The handle is where performance and personality meet.</p>
                </div>
                {renderOptionGroup('handleMaterial', 'Handle material')}
                {renderOptionGroup('handleStyle', 'Handle style')}
                {renderOptionGroup('finish', 'Blade finish', 'Optional, but helpful for the visual direction.')}
              </div>
            )}

            {currentStep === 4 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 4</span>
                  <h2>Add personal details.</h2>
                  <p>Share the touches that make the knife feel personal, useful, or gift-ready.</p>
                </div>

                <section className="request-section">
                  <div className="feature-grid">
                    <button
                      type="button"
                      className={`feature-toggle ${formData.engravingText !== null ? 'selected' : ''}`}
                      onClick={() => handleFieldChange('engravingText', formData.engravingText === null ? '' : null)}
                      aria-pressed={formData.engravingText !== null}
                    >
                      <span className="feature-icon"><LucideIcon name="PenLine" size={18} /></span>
                      <span>
                        <strong>Personal engraving</strong>
                        <small>Short text, initials, or a date.</small>
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`feature-toggle ${formData.sheathRequested ? 'selected' : ''}`}
                      onClick={() => handleFieldChange('sheathRequested', !formData.sheathRequested)}
                      aria-pressed={formData.sheathRequested}
                    >
                      <span className="feature-icon"><LucideIcon name="PackageCheck" size={18} /></span>
                      <span>
                        <strong>Custom sheath</strong>
                        <small>Add matching carry or storage protection.</small>
                      </span>
                    </button>
                  </div>

                  {formData.engravingText !== null && (
                    <label className="form-field" htmlFor="engravingText">
                      <span>Engraving text</span>
                      <input
                        id="engravingText"
                        type="text"
                        placeholder="Initials, name, or date"
                        value={formData.engravingText || ''}
                        onChange={(event) => handleFieldChange('engravingText', event.target.value)}
                        maxLength="30"
                      />
                      <small>{(formData.engravingText || '').length}/30 characters</small>
                    </label>
                  )}
                </section>

                <section className="request-section">
                  <label className="form-field" htmlFor="additionalNotes">
                    <span>Custom instructions and overall feel</span>
                    <textarea
                      id="additionalNotes"
                      placeholder="Describe the purpose, style, colors, references, must-haves, or details Nolan should know."
                      value={formData.additionalNotes}
                      onChange={(event) => handleFieldChange('additionalNotes', event.target.value)}
                      required
                      rows="6"
                    />
                    <small>These notes help Nolan shape the quote and refine the design with you.</small>
                  </label>
                </section>
              </div>
            )}

            {currentStep === 5 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 5</span>
                  <h2>Set timeline and delivery preferences.</h2>
                  <p>This helps Nolan plan the build and follow-up conversation.</p>
                </div>

                <section className="request-section split-fields">
                  <label className="form-field" htmlFor="desiredCompletionDate">
                    <span>Desired completion date</span>
                    <input
                      id="desiredCompletionDate"
                      type="date"
                      value={formData.desiredCompletionDate}
                      onChange={(event) => handleFieldChange('desiredCompletionDate', event.target.value)}
                    />
                  </label>

                  <div className="delivery-field" role="radiogroup" aria-label="Delivery method">
                    <span>Delivery method</span>
                    <div className="delivery-options">
                      {[
                        { value: 'pickup', label: 'Pickup', icon: 'MapPin', text: 'Coordinate a local handoff.' },
                        { value: 'shipping', label: 'Shipping', icon: 'Truck', text: 'Ship when finished.' }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={formData.deliveryPreference === option.value}
                          className={`delivery-option ${formData.deliveryPreference === option.value ? 'selected' : ''}`}
                          onClick={() => handleFieldChange('deliveryPreference', option.value)}
                        >
                          <LucideIcon name={option.icon} size={18} />
                          <strong>{option.label}</strong>
                          <small>{option.text}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {currentStep === 6 && (
              <div className="form-step">
                <div className="step-heading">
                  <span>Step 6</span>
                  <h2>Review the brief.</h2>
                  <p>Make sure the essentials are right before sending it to Nolan.</p>
                </div>

                <div className="review-summary">
                  <section className="review-section">
                    <h3>Knife</h3>
                    {renderReviewRow('Type', getOptionLabel('knifeType', formData.knifeType))}
                    {renderReviewRow('Use', getOptionLabel('intendedUse', formData.intendedUse))}
                    {renderReviewRow('Blade style', getOptionLabel('bladeStyle', formData.bladeStyle))}
                    {renderReviewRow('Blade size', getOptionLabel('bladeSizeCategory', formData.bladeSizeCategory))}
                    {formData.customSizeInches && renderReviewRow('Specific length', `${formData.customSizeInches} in`)}
                    {renderReviewRow('Steel', getOptionLabel('steelType', formData.steelType))}
                  </section>

                  <section className="review-section">
                    <h3>Handle and finish</h3>
                    {renderReviewRow('Material', getOptionLabel('handleMaterial', formData.handleMaterial))}
                    {renderReviewRow('Style', getOptionLabel('handleStyle', formData.handleStyle))}
                    {renderReviewRow('Finish', getOptionLabel('finish', formData.finish))}
                  </section>

                  <section className="review-section">
                    <h3>Details</h3>
                    {renderReviewRow('Engraving', formData.engravingText || 'None')}
                    {renderReviewRow('Sheath', formData.sheathRequested ? 'Custom sheath requested' : 'No sheath requested')}
                    {renderReviewRow('Delivery', formData.deliveryPreference === 'pickup' ? 'Pickup' : 'Shipping')}
                    {formData.desiredCompletionDate && renderReviewRow('Desired date', new Date(`${formData.desiredCompletionDate}T12:00:00`).toLocaleDateString())}
                    {formData.additionalNotes && (
                      <div className="review-notes">
                        <span>Notes</span>
                        <p>{formData.additionalNotes}</p>
                      </div>
                    )}
                  </section>

                  <section className="review-section estimate-review-section">
                    <h3>Estimate</h3>
                    {renderReviewRow('Estimated price', `$${estimatedPrice.toFixed(2)}`)}
                    {renderReviewRow('15% priority deposit', `$${depositAmount.toFixed(2)}`)}
                    <div className="review-notes">
                      <span>Note</span>
                      <p>The deposit is 15% of this estimate. It gives your request priority review, opens messages for the build, and remains refundable if the final quote is not the right fit.</p>
                    </div>
                  </section>
                </div>

                <div className="final-note">
                  <LucideIcon name="BadgeDollarSign" size={19} />
                  <p>Pay the deposit for priority review and build messages, or submit a standard request and Nolan will reach out if he can quote it.</p>
                </div>
              </div>
            )}
          </main>
        </div>

        <div className="form-nav">
          <button
            type="button"
            className="btn-prev"
            onClick={() => (currentStep > 1 ? setCurrentStep(currentStep - 1) : navigate('/Store'))}
            disabled={isSubmitting}
          >
            <LucideIcon name="ArrowLeft" size={16} />
            {currentStep === 1 ? 'Back to store' : 'Previous'}
          </button>

          {currentStep < 6 ? (
            <button
              type="button"
              className="btn-next"
              onClick={handleNext}
              disabled={isSubmitting}
            >
              Continue
              <LucideIcon name="ArrowRight" size={16} />
            </button>
          ) : (
            <div className="review-actions">
              <button
                type="button"
                className="btn-skip"
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || isInactiveSignedIn}
              >
                {!user ? 'Sign in first' : isSubmitting && submitIntent === 'standard' ? 'Sending...' : 'Send without deposit'}
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || isInactiveSignedIn}
              >
                {!user ? 'Sign in to continue' : isSubmitting && submitIntent === 'deposit' ? 'Preparing deposit...' : `Send with 15% deposit: $${depositAmount.toFixed(2)}`}
                <LucideIcon name={!user ? 'LogIn' : 'CreditCard'} size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomKnifeRequest;
