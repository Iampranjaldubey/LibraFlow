package com.library.service.impl;

import com.library.dto.response.TransactionResponse;
import com.library.service.ReceiptService;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Generates PDF circulation receipts with OpenPDF (LGPL, already on the classpath).
 *
 * <p>Fonts are the built-in base-14 Helvetica, so no font files are shipped. The
 * currency is rendered as "Rs." rather than the ₹ glyph, which the base-14
 * WinAnsi encoding cannot represent.
 */
@Service
@Slf4j
public class ReceiptServiceImpl implements ReceiptService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("dd MMM yyyy, HH:mm");

    private static final Color BRAND = new Color(37, 99, 235);   // blue-600
    private static final Color MUTED = new Color(107, 114, 128); // gray-500

    private static final Font TITLE   = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 20, BRAND);
    private static final Font SUB     = FontFactory.getFont(FontFactory.HELVETICA, 11, MUTED);
    private static final Font LABEL   = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, Color.DARK_GRAY);
    private static final Font VALUE   = FontFactory.getFont(FontFactory.HELVETICA, 11, Color.BLACK);
    private static final Font FOOTER  = FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 8, MUTED);

    @Override
    public byte[] generateTransactionReceipt(TransactionResponse tx) {
        Document document = new Document(PageSize.A5, 40, 40, 44, 40);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            PdfWriter.getInstance(document, out);
            document.open();

            Paragraph title = new Paragraph("LibraFlow", TITLE);
            title.setSpacingAfter(2f);
            document.add(title);

            Paragraph subtitle = new Paragraph("Circulation Receipt", SUB);
            subtitle.setSpacingAfter(14f);
            document.add(subtitle);

            PdfPTable table = new PdfPTable(2);
            table.setWidthPercentage(100);
            table.setWidths(new float[]{1.15f, 2f});

            row(table, "Receipt #", "TXN-" + pad(tx.getId()));
            row(table, "Status", nullSafe(tx.getStatus()));
            row(table, "Member", nullSafe(tx.getUserName()));
            row(table, "Book", nullSafe(tx.getBookTitle()));
            row(table, "Issued", date(tx.getIssueDate()));
            row(table, "Due", date(tx.getDueDate()));
            row(table, "Returned", tx.getReturnDate() != null ? date(tx.getReturnDate()) : "—");
            row(table, "Fine", formatFine(tx.getFine()));
            if (tx.getFine() != null && tx.getFine() > 0) {
                row(table, "Fine paid", tx.isFinePaid() ? "Yes" : "No");
            }

            document.add(table);

            Paragraph footer = new Paragraph(
                    "Generated " + LocalDateTime.now().format(STAMP)
                            + "  •  This is a system-generated receipt.", FOOTER);
            footer.setSpacingBefore(18f);
            document.add(footer);

            document.close();
        } catch (DocumentException e) {
            // Surface as a runtime failure -> handled by the global 500 handler.
            log.error("Failed to render receipt PDF for transaction {}", tx.getId(), e);
            throw new IllegalStateException("Failed to generate receipt PDF", e);
        }
        return out.toByteArray();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void row(PdfPTable table, String label, String value) {
        table.addCell(cell(new Phrase(label, LABEL)));
        table.addCell(cell(new Phrase(value, VALUE)));
    }

    private PdfPCell cell(Phrase content) {
        PdfPCell cell = new PdfPCell(content);
        cell.setBorder(0);
        cell.setPaddingTop(3f);
        cell.setPaddingBottom(3f);
        cell.setHorizontalAlignment(Element.ALIGN_LEFT);
        return cell;
    }

    private String formatFine(Double fine) {
        if (fine == null || fine <= 0) return "None";
        return String.format("Rs. %.2f", fine);
    }

    private String date(LocalDate date) {
        return date == null ? "—" : date.format(DATE);
    }

    private String pad(Long id) {
        return id == null ? "0000" : String.format("%04d", id);
    }

    private String nullSafe(String value) {
        return value == null ? "—" : value;
    }
}
