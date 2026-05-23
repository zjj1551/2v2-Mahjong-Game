import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.util.ArrayList;
import java.util.List;

public class TextToPng {
    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("Usage: java -Djava.awt.headless=true TextToPng <input.txt> <output.png>");
            System.exit(2);
        }
        String in = args[0];
        String out = args[1];

        List<String> lines = new ArrayList<>();
        try (BufferedReader r = new BufferedReader(new FileReader(in))) {
            String l;
            while ((l = r.readLine()) != null) lines.add(l);
        }

        int wrap = 120;
        List<String> wrapped = new ArrayList<>();
        for (String l : lines) {
            if (l.length() == 0) { wrapped.add(""); continue; }
            int i = 0;
            while (i < l.length()) {
                int end = Math.min(i + wrap, l.length());
                wrapped.add(l.substring(i, end));
                i = end;
            }
        }

        Font font = new Font("Monospaced", Font.PLAIN, 12);
        FontMetrics fm = new Canvas().getFontMetrics(font);
        int lineHeight = fm.getHeight();
        int imgWidth = Math.min(2000, Math.max(600, fm.stringWidth(findLongest(wrapped)) + 20));
        int imgHeight = Math.min(3000, Math.max(200, lineHeight * wrapped.size() + 20));

        BufferedImage img = new BufferedImage(imgWidth, imgHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0,0,imgWidth,imgHeight);
        g.setColor(Color.BLACK);
        g.setFont(font);

        int y = fm.getAscent() + 10;
        for (String s : wrapped) {
            g.drawString(s, 10, y);
            y += lineHeight;
            if (y > imgHeight - 10) break;
        }
        g.dispose();
        ImageIO.write(img, "png", new File(out));
        System.out.println("WROTE: " + out);
    }

    private static String findLongest(List<String> lines) {
        String best = "";
        for (String s : lines) if (s.length() > best.length()) best = s;
        return best;
    }
}
