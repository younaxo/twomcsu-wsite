-- AlterTable
ALTER TABLE "form_field_answers" ADD CONSTRAINT "form_field_answers_responseId_fieldId_key" UNIQUE ("responseId", "fieldId");
