import React from "react";
import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";

export const JoiningChecklist = ({ checklist = {}, onToggle }) => {
  const steps = [
    { key: "offerLetterSigned", label: "Offer Letter & NDA Signed" },
    { key: "kycDocumentsVerified", label: "KYC & Identity Documents Verified" },
    { key: "bgvInitiated", label: "Background Verification Clear" },
    { key: "bankDetailsAdded", label: "Bank Account & PF/ESIC Details Added" },
    { key: "hardwareAllocated", label: "Laptop / Smartphone / Uniform Assigned" },
    { key: "orientationCompleted", label: "Safety & Systems Orientation Done" },
  ];

  const completedCount = steps.filter((s) => checklist[s.key]).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-gray-900 text-sm">Onboarding & Joining Progress</h4>
          <p className="text-xs text-gray-400">{completedCount} of {steps.length} milestones cleared</p>
        </div>
        <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
          {progressPercent}%
        </span>
      </div>

      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
        <div
          className="bg-emerald-500 h-full rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        ></div>
      </div>

      <div className="space-y-2 pt-2">
        {steps.map((step) => {
          const isDone = checklist[step.key];
          return (
            <div
              key={step.key}
              onClick={() => onToggle && onToggle(step.key, !isDone)}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                isDone
                  ? "bg-emerald-50/50 border-emerald-200/60 text-emerald-900"
                  : "bg-gray-50/50 border-gray-100 text-gray-700 hover:bg-gray-50"
              } ${onToggle ? "cursor-pointer" : ""}`}
            >
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
              )}
              <span className="text-xs font-medium">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default JoiningChecklist;
