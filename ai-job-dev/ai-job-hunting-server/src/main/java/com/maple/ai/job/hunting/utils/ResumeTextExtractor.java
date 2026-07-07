package com.maple.ai.job.hunting.utils;

import lombok.experimental.UtilityClass;
import org.apache.commons.lang3.StringUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

@UtilityClass
public class ResumeTextExtractor {

    public String extractText(byte[] bytes) {
        String fileType = FileTypeDetector.detectFileType(bytes);
        if ("pdf".equals(fileType)) {
            String pdfText = extractPdfText(bytes);
            if (StringUtils.isNotBlank(pdfText)) {
                return pdfText;
            }
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private String extractPdfText(byte[] bytes) {
        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(bytes))) {
            return new PDFTextStripper().getText(document);
        } catch (Exception ignored) {
            return "";
        }
    }
}
