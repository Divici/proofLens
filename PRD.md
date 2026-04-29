# PRD: AI-Powered Alcohol Label Verification App

## 1. Product Summary

Build a polished AI-powered alcohol label verification application for compliance agents reviewing alcohol beverage label applications.

The application should help agents verify that the information shown on uploaded alcohol label artwork matches the expected application data. It should extract label information, compare it against expected values, flag issues, explain findings, support human review, and help agents process both individual and batch label submissions quickly.

This product is a **human-in-the-loop compliance review assistant**, not an autonomous legal approval or rejection system. The AI accelerates routine matching and issue detection, while the human agent remains responsible for the final review decision.

Technical implementation choices are intentionally left open for the presearch phase. This PRD defines what the product must accomplish, not which stack or model should be used.

---

## 2. Source-Grounded Product Context

TTB compliance agents review a high volume of alcohol label applications each year. A large part of the review process involves comparing information on label artwork against information in the submitted application.

Common checks include:

- Brand name
- Class/type designation
- Alcohol content / ABV
- Net contents
- Bottler, producer, or importer information
- Country of origin for imports
- Government health warning statement

The stakeholder notes indicate several major product constraints:

1. **Speed is critical**
  - A previous vendor pilot failed because processing took 30–40 seconds.
  - The target expectation is approximately 5 seconds for useful single-label results.
2. **The UI must be extremely simple**
  - Agents vary widely in technical comfort.
  - The interface should be clean, obvious, and require minimal explanation.
3. **Human judgment is required**
  - Label review has nuance.
  - The system should not treat every text difference as an automatic rejection.
  - The human agent must be able to review and override AI findings.
4. **Government warning validation must be strict**
  - The government warning statement must be exact.
  - Formatting and capitalization issues, such as `Government Warning:` instead of `GOVERNMENT WARNING:`, should be flagged.
5. **Batch processing is highly valuable**
  - Importers may submit hundreds of labels at once.
  - The app should support batch upload and batch review workflows.
6. **Imperfect image handling matters**
  - Labels may be photographed at odd angles, with glare, blur, bad lighting, or cropping.
  - The app should detect image quality problems and attempt to process imperfect images when possible.
7. **No direct COLA integration is required**
  - The app should be built as a standalone product/proof-of-concept.
  - It may inform future procurement or integration decisions, but direct COLA integration is out of scope.

---

## 3. Product Vision

Create a fast, polished, agent-friendly compliance review tool that turns manual alcohol label checking into a guided AI-assisted workflow.

The app should feel like a practical internal government tool that a busy compliance agent could open, use immediately, and trust as a first-pass review assistant.

The product should reduce routine verification work while making edge cases easier to inspect.

---

## 4. Primary Users

## 4.1 Compliance Agent

A compliance agent reviews alcohol label applications and determines whether labels satisfy required information and formatting expectations.

### Goals

- Process labels faster.
- Reduce repetitive manual comparison.
- Quickly spot missing or mismatched information.
- Understand why the AI flagged an issue.
- Make final decisions confidently.
- Handle large queues without extra complexity.

### Pain Points

- Manually checking every label is repetitive.
- Existing systems are slow and dated.
- Large submissions must be reviewed one at a time.
- Some labels are difficult to read.
- Automation is only useful if it is faster than manual review.
- Bad software can make the job harder instead of easier.

---

## 4.2 Compliance Team Lead / Deputy Director

A team lead or stakeholder wants to evaluate whether AI can meaningfully improve label review throughput and consistency.

### Goals

- Reduce routine review burden on agents.
- Improve consistency of review.
- Help agents focus on nuanced cases.
- Understand where AI is reliable and where human review is needed.
- Evaluate whether the tool could support future procurement or workflow modernization.

---

## 4.3 IT / Technical Evaluator

A technical stakeholder evaluates architecture, security, reliability, deployment, and integration readiness.

### Goals

- Understand system boundaries.
- Avoid unnecessary sensitive data storage.
- Evaluate API/model dependencies.
- Understand how the product handles blocked network environments.
- Review implementation tradeoffs.
- Confirm the app is standalone and does not require COLA integration.

---

## 5. Problem Statement

Compliance agents spend too much time manually verifying that alcohol label artwork matches application data. Much of this work is repetitive field matching, but the process still requires human judgment for nuanced cases.

Existing or attempted automation has failed when it was too slow, too difficult to use, or insufficiently aligned with agent workflow.

Agents need a fast, simple, explainable AI assistant that can perform first-pass label verification, highlight issues, support batch review, handle imperfect images, and leave final compliance decisions to humans.

---

## 6. Product Goals

The application must:

1. Allow agents to verify individual alcohol labels against expected application data.
2. Extract structured information from uploaded label artwork.
3. Compare extracted label information to expected values.
4. Clearly identify matches, likely matches, mismatches, missing fields, and uncertain results.
5. Strictly validate government warning statement presence and wording.
6. Support human review, overrides, notes, and final decisions.
7. Support batch upload and batch result review.
8. Handle imperfect label images when possible.
9. Provide clear image quality warnings when AI extraction may be unreliable.
10. Provide a polished, simple, accessible user experience.
11. Produce exportable review reports.
12. Maintain useful review history and auditability.
13. Be deployed and accessible for testing.
14. Include a complete source code repository and documentation.

---

## 7. Non-Goals

The application should not:

- Directly integrate with COLA.
- Replace human compliance agents.
- Make final legally binding approval or rejection decisions without human review.
- Require users to understand AI, OCR, prompts, models, or backend architecture.
- Depend on one specific implementation stack before presearch is complete.
- Assume perfect label images.
- Ignore uncertainty or low-confidence extraction.
- Hide AI reasoning from the agent.

---

## 8. Product Principles

## 8.1 Human-in-the-Loop First

The AI should assist, not decide.

The system should:

- Extract information.
- Compare values.
- Flag issues.
- Explain findings.
- Recommend actions.
- Surface confidence and uncertainty.
- Let the human agent make the final decision.

The agent should be able to:

- Accept AI findings.
- Override AI findings.
- Add notes.
- Mark items for manual review.
- Request a better image.
- Approve or reject after reviewing the evidence.

---

## 8.2 Fast Enough to Beat Manual Review

The product must be optimized around speed.

A single-label verification should aim to return useful results in approximately 5 seconds whenever possible.

For longer operations, the UI must show clear progress and allow the user to continue working.

Batch processing should provide per-file progress and partial results as each label completes.

---

## 8.3 Simple Enough for Non-Technical Agents

The app should be obvious from the first screen.

The core workflow should be:

1. Upload label or batch.
2. Enter or import expected application data.
3. Run verification.
4. Review results.
5. Make final decision.

The UI should avoid:

- Hidden controls.
- Technical jargon.
- Complex configuration.
- Confusing AI terminology.
- Overloaded dashboards.

---

## 8.4 Explain Every Flag

Every issue should answer:

- What field is affected?
- What was expected?
- What was found?
- Why was it flagged?
- How confident is the system?
- What should the agent do next?

---

## 8.5 Treat Strict and Nuanced Fields Differently

Not every field should be evaluated the same way.

Some fields allow reasonable normalization:

- Brand name capitalization
- Minor punctuation differences
- Whitespace differences
- Equivalent ABV/proof formatting

Other fields require strictness:

- Government warning statement
- Required warning capitalization
- Missing mandatory fields
- Incorrect ABV
- Incorrect net contents

---

## 9. Full Product Scope

All items in this section are considered in scope.

## 9.1 Single Label Verification

The app must allow a user to upload one alcohol label image and verify it against expected application values.

Required capabilities:

- Upload label image.
- Preview uploaded label.
- Enter expected application data.
- Run verification.
- Extract visible label information.
- Compare extracted values against expected data.
- Display field-level results.
- Display overall result.
- Allow human final decision.

---

## 9.2 Batch Label Verification

The app must support batch uploads for multiple labels.

Required capabilities:

- Upload multiple label files at once.
- Display a batch queue.
- Show processing status per label.
- Show result summary per label.
- Allow filtering by status.
- Allow opening each label’s detailed review.
- Allow batch-level export.
- Allow retrying failed labels.
- Allow removing labels from the batch.
- Allow agents to process completed results while other labels are still running.

Batch statuses:

- Queued
- Processing
- Complete
- Failed
- Needs Manual Review
- Request Better Image

Batch summary should include:

- Total labels uploaded
- Number completed
- Number passed
- Number with warnings
- Number failed
- Number needing manual review
- Number with image quality issues
- Average processing time
- Total processing time

---

## 9.3 Expected Application Data Input

The app must provide a way to enter or load expected application values.

Required fields:

- Beverage category
- Brand name
- Class/type designation
- Alcohol content / ABV
- Net contents
- Bottler / producer / importer name
- Bottler / producer / importer address
- Country of origin, if applicable
- Government warning required flag
- Optional notes or application reference ID

The app should support:

- Manual entry
- Reusing sample/demo data
- Importing structured application data, if feasible
- Editing expected values before verification
- Saving expected data with a review record

---

## 9.4 AI Label Extraction

The app must extract structured data from uploaded label artwork.

Required extracted fields:

- Brand name
- Class/type designation
- Alcohol content text
- ABV percentage, when available
- Proof, when available
- Net contents
- Bottler / producer / importer name
- Bottler / producer / importer address
- Country of origin
- Government warning text
- Raw extracted text
- Image quality notes
- Extraction confidence

The system should preserve both:

1. Structured extracted fields.
2. Raw extracted text for human inspection.

---

## 9.5 Field-by-Field Verification

The app must compare expected values against extracted values and generate field-level results.

Each field result must include:

- Field name
- Expected value
- Extracted value
- Status
- Confidence
- Explanation
- Suggested action
- Evidence source, where possible
- Human override status, if applicable

Supported statuses:

- Pass
- Likely Match
- Warning
- Fail
- Missing
- Low Confidence
- Needs Manual Review
- Not Required

---

## 9.6 Overall Review Result

The app must calculate an overall review status based on field-level results.

Overall statuses:

- Pass
- Pass with Warnings
- Needs Manual Review
- Fail
- Request Better Image

The overall status should not hide field-level detail.

Example:

```text
Overall: Needs Manual Review

Passed: 5
Likely Matches: 1
Warnings: 1
Failed: 1
Low Confidence: 1
Processing Time: 4.8 seconds

```

## 9.7 Human Review and Decision Layer

The app must include a human decision layer.

Agents must be able to:

- Review AI-extracted values.
- Review field comparison results.
- Accept AI findings.
- Override field statuses.
- Add notes to individual fields.
- Add notes to the full label review.
- Mark the label as approved.
- Mark the label as rejected.
- Mark the label as needing manual review.
- Request a better image.
- Save final review outcome.

The UI must make clear that the AI is providing a recommendation, not a final legal decision.

---

## 9.8 Human Override Workflow

When an agent overrides an AI result, the app should capture:

- Field name
- Original AI status
- New human-selected status
- Reason or note
- Timestamp
- Reviewer identity, if authentication exists

Example:

```

```

```
Field: Brand Name
AI Status: Likely Match
Human Status: Pass
Reason: Difference is capitalization only and does not change brand identity.
```

---

## 9.9 Government Warning Validation

Government warning validation must be treated as a strict check.

The app must verify:

-   
Warning statement is present.  

-   
Warning text is complete.  

-   
Required prefix appears as `GOVERNMENT WARNING:`  

-   
Required prefix is uppercase.  

-   
Warning wording is not materially changed.  

-   
Warning is not buried in unreadable text.  

-   
Warning is not missing due to cropping or image quality.  


The app should flag:

-   
Missing warning  

-   
Incomplete warning  

-   
Incorrect capitalization  

-   
Modified wording  

-   
Unreadable warning  

-   
Low confidence extraction  

-   
Warning found but potentially too small or obscured, if detectable  


Example result:

```

```

```
Field: Government Warning
Status: Fail
Expected: GOVERNMENT WARNING:
Found: Government Warning:
Explanation: The warning prefix was found, but it does not match the required uppercase format.
Suggested Action: Reject or send to manual review.
```

---

## 9.10 Nuanced Matching

The app must avoid treating all text differences as equal.

The app should identify likely matches for minor differences such as:

-   
Capitalization  

-   
Extra whitespace  

-   
Curly quotes vs straight quotes  

-   
Minor punctuation differences  

-   
Common abbreviations  

-   
Equivalent ABV/proof formatting  

-   
Equivalent volume units  


Example:

```

```

```
Expected: Stone's Throw
Found: STONE'S THROW
Status: Likely Match
Explanation: The values differ only by capitalization.
Suggested Action: Accept if capitalization is not material, or send to manual review.
```

---

## 9.11 Image Quality Handling

The app must detect and communicate image quality problems.

Potential issues:

-   
Blur  

-   
Glare  

-   
Low lighting  

-   
Skewed angle  

-   
Cropping  

-   
Low resolution  

-   
Obstructed text  

-   
Unreadable small text  

-   
Reflections on bottle or label  

-   
Multiple labels in one image  


The app should attempt extraction when possible, but clearly show when results may be unreliable.

Example:

```

```

```
Image Quality Warning
The government warning area appears partially obscured by glare. Results for this field may be unreliable.
Suggested Action: Request a clearer image or manually review.
```

---

## 9.12 Advanced Image Review Support

The app should provide visual support for human review.

Required capabilities:

-   
Show uploaded image beside extracted results.  

-   
Allow zooming into the label.  

-   
Allow rotating image if needed.  

-   
Allow viewing extracted raw text.  

-   
Highlight or reference where extracted evidence came from, if feasible.  

-   
Support side-by-side comparison between label image and expected application data.  


---

## 9.13 Evidence Highlighting

The app should help agents understand where findings came from.

Evidence support may include:

-   
Highlighted text regions on the image.  

-   
Bounding boxes around detected fields.  

-   
Cropped evidence snippets.  

-   
Field-to-image references.  

-   
Raw OCR text excerpts.  


The exact implementation should be determined during presearch, but the product should aim to make AI findings inspectable.

---

## 9.14 Review History

The app must maintain a review history for completed label reviews.

Review history should include:

-   
Uploaded file name  

-   
Review date/time  

-   
Expected application data  

-   
Extracted label data  

-   
Field-level results  

-   
Image quality warnings  

-   
Human overrides  

-   
Final human decision  

-   
Reviewer notes  

-   
Processing time  

-   
Export status  


Users should be able to:

-   
View previous reviews  

-   
Search or filter review history  

-   
Reopen a review  

-   
Export review results  

-   
See whether a result was AI-generated, human-overridden, or final  


---

## 9.15 Exportable Review Report

The app must support exporting a review report.

Report should include:

-   
Label image or filename  

-   
Expected values  

-   
Extracted values  

-   
Field-level statuses  

-   
Overall status  

-   
AI explanations  

-   
Confidence levels  

-   
Image quality warnings  

-   
Human overrides  

-   
Final human decision  

-   
Reviewer notes  

-   
Timestamp  

-   
Processing time  


Export formats should be determined during presearch.

Possible formats:

-   
PDF  

-   
CSV  

-   
JSON  

-   
Printable HTML  


---

## 9.16 Beverage-Type-Aware Review

The app must account for the fact that requirements can vary by beverage type.

Supported categories:

-   
Beer  

-   
Wine  

-   
Distilled spirits  

-   
Other / Unknown  


The app should allow the user to select beverage category and adapt required checks accordingly.

At minimum, the app should clearly distinguish:

-   
Universal fields  

-   
Beverage-specific fields  

-   
Fields not required for the selected beverage type  

-   
Fields that need manual review because rules vary  


---

## 9.17 Demo and Test Label Support

The app must include useful demo data for testing.

Required demo scenarios:

1.   
Fully compliant distilled spirits label.  

2.   
Label with brand capitalization difference.  

3.   
Label with incorrect ABV.  

4.   
Label with missing net contents.  

5.   
Label with incorrect government warning capitalization.  

6.   
Label with incomplete government warning.  

7.   
Label with glare or blur.  

8.   
Batch upload with mixed pass/fail/manual review results.  


The project may use generated or sourced test labels.

---

## 10. Field Verification Requirements

## 10.1 Brand Name

The app must compare expected brand name to extracted brand name.

Required behavior:

-   
Exact match should pass.  

-   
Case-only difference should likely match.  

-   
Minor punctuation difference should likely match or warning.  

-   
Missing brand should fail.  

-   
Clearly different brand should fail.  

-   
Ambiguous brand should need manual review.  


---

## 10.2 Class / Type Designation

The app must verify that the expected class/type appears on the label.

Required behavior:

-   
Exact or normalized match should pass.  

-   
Similar wording should likely match or warning.  

-   
Missing class/type should be missing or fail depending on beverage type.  

-   
Conflicting class/type should fail.  

-   
Ambiguous extraction should need manual review.  


---

## 10.3 Alcohol Content / ABV

The app must verify alcohol content.

Required behavior:

-   
Equivalent ABV should pass.  

-   
Equivalent ABV/proof should pass or likely match.  

-   
Different ABV should fail.  

-   
Missing ABV should fail, missing, or not required depending on beverage type.  

-   
Ambiguous extraction should need manual review.  


The app should understand common formats such as:

```

```

```
45% Alc./Vol.
45% ABV
Alcohol 45% by Volume
90 Proof
```

---

## 10.4 Net Contents

The app must verify net contents.

Required behavior:

-   
Equivalent volume should pass.  

-   
Unit formatting differences should normalize.  

-   
Different volume should fail.  

-   
Missing net contents should fail.  

-   
Ambiguous extraction should need manual review.  


Examples:

```

```

```
750 mL
750ml
0.75 L
```

---

## 10.5 Bottler / Producer / Importer Information

The app must verify producer/importer information where expected.

Required behavior:

-   
Clear name/address match should pass.  

-   
Partial match should warn.  

-   
Missing required information should fail.  

-   
Different entity or address should fail or need manual review.  

-   
Low-confidence extraction should need manual review.  


---

## 10.6 Country of Origin

The app must verify country of origin when applicable.

Required behavior:

-   
If expected and found, pass.  

-   
If not applicable, mark not required.  

-   
If expected and missing, fail or missing.  

-   
If a different country is found, fail.  

-   
If unclear, need manual review.  


---

## 10.7 Government Health Warning

The app must verify government warning presence, completeness, wording, and required capitalization.

Required behavior:

-   
Exact warning found should pass.  

-   
Missing warning should fail.  

-   
Incomplete warning should fail.  

-   
Modified wording should fail or warning depending severity.  

-   
Incorrect capitalization of required prefix should fail.  

-   
Unreadable warning should need manual review or request better image.  


---

## 11. User Experience Requirements

## 11.1 Main Navigation

The app should provide clear access to:

-   
Single Label Review  

-   
Batch Review  

-   
Review History  

-   
Reports / Exports  

-   
Settings or Help, if needed  


Navigation should remain minimal and obvious.

---

## 11.2 Single Review Screen

Required sections:

1.   
Upload label  

2.   
Enter expected data  

3.   
Verify label  

4.   
Review extracted data  

5.   
Review field results  

6.   
Make final decision  

7.   
Export or save report  


---

## 11.3 Batch Review Screen

Required sections:

1.   
Upload multiple labels  

2.   
Batch queue  

3.   
Processing progress  

4.   
Summary metrics  

5.   
Filterable result table  

6.   
Per-label detail view  

7.   
Batch export  


---

## 11.4 Result Detail Screen

Each label detail screen should show:

-   
Label image preview  

-   
Expected application data  

-   
Extracted label data  

-   
Field-by-field comparison  

-   
Image quality warnings  

-   
AI explanation  

-   
Human override controls  

-   
Final decision controls  

-   
Report export option  


---

## 11.5 Empty, Loading, and Error States

The app must have polished states for:

-   
No file uploaded  

-   
No expected data entered  

-   
Verification running  

-   
Batch processing running  

-   
AI extraction failed  

-   
Image unreadable  

-   
Upload failed  

-   
Export failed  

-   
Review saved  

-   
Review reopened  


Error messages should be plain English.

Bad:

```

```

```
500 Internal Server Error
```

Good:

```

```

```
We could not verify this label because the image text was unreadable. Try uploading a clearer image or send this label to manual review.
```

---

## 12. Performance Requirements

## 12.1 Single Label Performance

The app should aim to return single-label verification results in approximately 5 seconds whenever possible.

The app should track and display processing time.

If processing takes longer, the UI should communicate progress clearly.

---

## 12.2 Batch Performance

Batch processing should:

-   
Show per-label progress.  

-   
Return partial results as labels complete.  

-   
Avoid blocking the entire batch when one label fails.  

-   
Allow retrying failed labels.  

-   
Clearly distinguish queued, processing, complete, failed, and manual review states.  


---

## 12.3 Timeout Handling

If verification takes too long, the app should provide a useful fallback.

Example:

```

```

```
This label is taking longer than expected. You can continue waiting, retry, or send it to manual review.
```

---

## 13. Data Requirements

## 13.1 Expected Application Data

The app should represent expected application data in a structured format.

Required data:

```

```

```
- Beverage category
- Brand name
- Class/type designation
- Alcohol content / ABV
- Net contents
- Bottler / producer / importer name
- Bottler / producer / importer address
- Country of origin, if applicable
- Government warning required
- Application notes/reference
```

---

## 13.2 Extracted Label Data

The app should represent extracted label data in a structured format.

Required data:

```

```

```
- Brand name
- Class/type designation
- Alcohol content text
- ABV percentage
- Proof
- Net contents
- Bottler / producer / importer name
- Bottler / producer / importer address
- Country of origin
- Government warning text
- Raw extracted text
- Image quality notes
- Extraction confidence
```

---

## 13.3 Verification Result Data

Each field-level verification result should include:

```

```

```
- Field name
- Expected value
- Extracted value
- Status
- Confidence
- Explanation
- Suggested action
- Evidence reference
- Human override, if present
```

---

## 13.4 Human Decision Data

Final review decision should include:

```

```

```
- Final decision
- Reviewer notes
- Field overrides
- Timestamp
- Reviewer identity, if available
```

Final decisions:

```

```

```
- Approved
- Rejected
- Needs Manual Review
- Request Better Image
```

---

## 14. Security, Privacy, and Compliance Requirements

The app must be careful with uploaded documents and review data.

Required considerations:

-   
Do not expose AI provider keys or secrets in the frontend.  

-   
Validate uploaded files.  

-   
Limit file size.  

-   
Avoid unnecessary storage of sensitive files.  

-   
Make data retention behavior clear.  

-   
Document any third-party AI or OCR services used.  

-   
Document whether uploaded images are stored, temporarily processed, or deleted.  

-   
Account for environments where outbound access to some domains may be blocked.  

-   
Keep COLA integration out of scope.  


Security and data-handling decisions should be researched and documented during presearch.

---

## 15. Accessibility Requirements

The app should be usable by agents with different levels of technical comfort and accessibility needs.

Required considerations:

-   
Clear typography  

-   
High contrast  

-   
Large click targets  

-   
Keyboard navigability  

-   
Screen-reader-friendly labels  

-   
Plain language  

-   
Avoid color-only status communication  

-   
Clear status icons and text labels  

-   
Helpful instructions near user actions  


---

## 16. Documentation Requirements

The source repository must include documentation covering:

-   
Product overview  

-   
Problem statement  

-   
How to run locally  

-   
How to deploy  

-   
How to use the app  

-   
AI/OCR approach selected  

-   
Verification approach selected  

-   
Human-in-the-loop workflow  

-   
Batch processing workflow  

-   
Image quality handling  

-   
Government warning validation  

-   
Data storage and privacy behavior  

-   
Assumptions made  

-   
Tradeoffs considered  

-   
Known limitations  

-   
Future improvements  


---

## 17. Deliverables

The final submission must include:

## 17.1 Source Code Repository

The repository must include:

-   
All source code  

-   
README  

-   
Setup instructions  

-   
Run instructions  

-   
Documentation of approach  

-   
Documentation of tools used  

-   
Documentation of assumptions  

-   
Documentation of tradeoffs and limitations  


## 17.2 Deployed Application URL

The deployed app must be accessible for testing.

The deployed app should allow reviewers to:

-   
Try a single-label verification flow  

-   
Try batch upload  

-   
Use sample/demo labels  

-   
Review results  

-   
Make a human decision  

-   
Export a report  


---

## 18. Acceptance Criteria

## 18.1 Core Product Acceptance Criteria

The product is complete when:

-   
A user can upload one label.  

-   
A user can upload multiple labels.  

-   
A user can enter expected application values.  

-   
The app can extract structured label information.  

-   
The app can compare extracted values to expected values.  

-   
The app returns field-level statuses.  

-   
The app returns an overall status.  

-   
The app validates government warning text strictly.  

-   
The app handles nuanced matching for fields like brand name.  

-   
The app detects and communicates image quality issues.  

-   
The app supports human override and final decision.  

-   
The app saves review history.  

-   
The app exports review reports.  

-   
The app shows processing progress.  

-   
The app handles errors clearly.  

-   
The app is simple and usable by non-technical agents.  

-   
The app is deployed.  

-   
The repository is documented.  


---

## 18.2 Single Label Acceptance Criteria

A user can complete the following flow:

1.   
Open app.  

2.   
Choose single label review.  

3.   
Upload label image.  

4.   
Enter expected application data.  

5.   
Click verify.  

6.   
See extracted data.  

7.   
See field-by-field results.  

8.   
Inspect image and evidence.  

9.   
Override any field result.  

10.   
Add review notes.  

11.   
Choose final decision.  

12.   
Export report.  

13.   
Save review to history.  


---

## 18.3 Batch Review Acceptance Criteria

A user can complete the following flow:

1.   
Open batch review.  

2.   
Upload multiple labels.  

3.   
See batch queue.  

4.   
Start verification.  

5.   
See progress per label.  

6.   
See batch summary.  

7.   
Filter results by status.  

8.   
Open individual label details.  

9.   
Make final decisions.  

10.   
Retry failed labels.  

11.   
Export batch report.  

12.   
Save batch review history.  


---

## 18.4 Image Quality Acceptance Criteria

The app should:

-   
Attempt to process imperfect images.  

-   
Identify likely quality issues.  

-   
Communicate uncertainty clearly.  

-   
Avoid overconfident results when text is unreadable.  

-   
Suggest requesting a clearer image when needed.  


---

## 18.5 Human-in-the-Loop Acceptance Criteria

The app should:

-   
Never present AI output as a final legal decision.  

-   
Allow the human to review all findings.  

-   
Allow field-level overrides.  

-   
Allow final decision selection.  

-   
Capture notes and override reasons.  

-   
Preserve AI result and human decision separately.  


---

## 19. Required Demo Scenarios

The final app should support these demonstration scenarios.

## Scenario 1: Fully Matching Distilled Spirits Label

Expected:

```

```

```
Brand Name: OLD TOM DISTILLERY
Class/Type: Kentucky Straight Bourbon Whiskey
Alcohol Content: 45% Alc./Vol. (90 Proof)
Net Contents: 750 mL
Government Warning: Required
```

Expected outcome:

```

```

```
Overall: Pass
Field results: Mostly Pass
```

---

## Scenario 2: Nuanced Brand Match

Expected:

```

```

```
Stone's Throw
```

Found:

```

```

```
STONE'S THROW
```

Expected outcome:

```

```

```
Status: Likely Match
Explanation: Difference appears to be capitalization only.
Suggested Action: Accept or manually review.
```

---

## Scenario 3: Incorrect ABV

Expected:

```

```

```
45% ABV
```

Found:

```

```

```
40% ABV
```

Expected outcome:

```

```

```
Status: Fail
Explanation: Alcohol content does not match the expected application value.
Suggested Action: Reject or manually review.
```

---

## Scenario 4: Government Warning Capitalization Error

Expected:

```

```

```
GOVERNMENT WARNING:
```

Found:

```

```

```
Government Warning:
```

Expected outcome:

```

```

```
Status: Fail
Explanation: Required warning prefix is not in uppercase.
Suggested Action: Reject or manually review.
```

---

## Scenario 5: Incomplete Government Warning

Expected outcome:

```

```

```
Status: Fail
Explanation: Government warning appears incomplete or materially altered.
Suggested Action: Reject or manually review.
```

---

## Scenario 6: Bad Image Quality

Input:

```

```

```
Label image with glare, blur, or bad angle.
```

Expected outcome:

```

```

```
Overall: Needs Manual Review or Request Better Image
Image Quality Warning: Text may be unreliable due to image quality.
```

---

## Scenario 7: Batch Upload with Mixed Results

Input:

```

```

```
Multiple labels with mixed pass, fail, warning, and low-confidence outcomes.
```

Expected outcome:

```

```

```
Batch summary shows counts by status.
Each label can be opened and reviewed individually.
```

---

## 20. Presearch Scope

The presearch phase should determine the best implementation approach.

Do not assume the stack, model, OCR tool, database, deployment platform, or architecture before research.

## 20.1 Compliance Research

Research:

-   
Exact government warning text requirements.  

-   
TTB label requirements for beer.  

-   
TTB label requirements for wine.  

-   
TTB label requirements for distilled spirits.  

-   
Which fields are universal.  

-   
Which fields vary by beverage type.  

-   
How strict formatting and capitalization rules are.  

-   
Public examples of compliant and non-compliant labels.  

-   
How label information is commonly displayed.  


---

## 20.2 AI / OCR / Vision Research

Research:

-   
Best approach for extracting structured information from alcohol label images.  

-   
Whether to use OCR, vision models, document AI, multimodal LLMs, or a hybrid approach.  

-   
Accuracy tradeoffs.  

-   
Speed tradeoffs.  

-   
Cost tradeoffs.  

-   
Structured output reliability.  

-   
Handling of glare, blur, rotation, and low-quality images.  

-   
Whether bounding boxes/evidence highlighting are feasible.  

-   
How to measure extraction confidence.  

-   
How to avoid hallucinated extracted values.  


---

## 20.3 Verification Logic Research

Research:

-   
Best way to normalize brand names.  

-   
Best way to compare ABV/proof equivalents.  

-   
Best way to normalize volume units.  

-   
Best way to compare government warning text strictly.  

-   
Best way to identify likely matches vs true mismatches.  

-   
Best way to separate deterministic rules from AI-assisted judgment.  

-   
How to represent confidence and uncertainty.  


---

## 20.4 UX Research

Research:

-   
Best interface patterns for compliance review tools.  

-   
Best way to present pass/warning/fail results.  

-   
Best way to display confidence to non-technical users.  

-   
Best way to support human overrides.  

-   
Best way to display batch processing.  

-   
Best way to show image evidence.  

-   
Best way to keep the product simple despite advanced functionality.  


---

## 20.5 Architecture Research

Research:

-   
Best architecture for speed, reliability, and deployment.  

-   
Best file upload strategy.  

-   
Best image preprocessing strategy.  

-   
Best way to handle batch jobs.  

-   
Best way to store review history.  

-   
Best way to export reports.  

-   
Best deployment option for a polished public prototype.  

-   
Best security posture for uploaded images and AI calls.  

-   
Best way to support environments with restricted outbound traffic.  


---

## 20.6 Testing Research

Research:

-   
How to generate realistic test alcohol labels.  

-   
How to test label extraction.  

-   
How to test verification logic.  

-   
How to test government warning validation.  

-   
How to test batch processing.  

-   
How to test image quality issues.  

-   
How to test human override workflows.  

-   
How to evaluate speed and accuracy.  


---

## 21. Open Questions for Presearch

The following should be answered during presearch:

1.   
What exact government warning text should be used as the canonical validation target?  

2.   
Which TTB fields are mandatory for each beverage category?  

3.   
What is the best AI/OCR approach for speed and accuracy?  

4.   
Can the selected approach consistently return results near the 5-second target?  

5.   
How should confidence be measured and shown?  

6.   
How should batch processing be implemented?  

7.   
How should imperfect image handling be implemented?  

8.   
How should evidence highlighting be implemented?  

9.   
What should be stored in review history?  

10.   
What export format is most useful?  

11.   
What data privacy and retention model is appropriate?  

12.   
What tradeoffs should be documented in the README?  


---

## 22. Evaluation Alignment

The final product should demonstrate:

-   
Correctness and completeness of label verification.  

-   
Strong attention to stakeholder requirements.  

-   
Polished user experience.  

-   
Clear error handling.  

-   
Fast performance.  

-   
Thoughtful human-in-the-loop design.  

-   
Strong batch workflow.  

-   
Robust handling of imperfect images.  

-   
Explainable AI output.  

-   
Appropriate technical choices based on presearch.  

-   
Clean code organization.  

-   
Strong documentation.  

-   
Creative problem-solving.  


---

## 23. Final Product Definition

An AI-powered alcohol label verification assistant that helps compliance agents review individual and batch label submissions by extracting label data, comparing it against expected application values, flagging issues with explanations and confidence, supporting imperfect image review, generating reports, preserving review history, and keeping the human agent in control of the final decision.