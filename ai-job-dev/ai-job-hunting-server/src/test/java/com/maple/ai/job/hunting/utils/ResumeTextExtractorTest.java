package com.maple.ai.job.hunting.utils;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ResumeTextExtractorTest {

    @Test
    void extractText_readsPdfTextWithoutAiProvider() {
        byte[] pdfBytes = """
                %PDF-1.4
                1 0 obj
                << /Type /Catalog /Pages 2 0 R >>
                endobj
                2 0 obj
                << /Type /Pages /Kids [3 0 R] /Count 1 >>
                endobj
                3 0 obj
                << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
                endobj
                4 0 obj
                << /Length 58 >>
                stream
                BT /F1 18 Tf 72 720 Td (Java Backend Engineer resume) Tj ET
                endstream
                endobj
                5 0 obj
                << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
                endobj
                xref
                0 6
                0000000000 65535 f
                trailer
                << /Root 1 0 R >>
                %%EOF
                """.getBytes(StandardCharsets.UTF_8);

        String text = ResumeTextExtractor.extractText(pdfBytes);

        assertTrue(text.contains("Java Backend Engineer resume"));
    }
}
