import { ParsedEbook } from '../types/ebook';
import { buildChapterStructure, calculateStats } from '../utils/ebookParser';
import { EbookChapter } from '../types/ebook';

/**
 * Builds a chapter from its raw text so the derived reader fields
 * (paragraphs, sentences, paragraphRanges) can never drift from `content`.
 */
function chapter(
  id: string,
  index: number,
  title: string,
  content: string,
  rest: Omit<
    EbookChapter,
    'id' | 'index' | 'title' | 'content' | 'paragraphs' | 'sentences' | 'paragraphRanges'
  >,
): EbookChapter {
  return { id, index, title, content, ...buildChapterStructure(content), ...rest };
}

export const SAMPLE_BOOKS: ParsedEbook[] = [
  {
    metadata: {
      title: 'Dế Mèn Phiêu Lưu Ký',
      author: 'Tô Hoài',
      language: 'vi',
      format: 'epub',
      fileName: 'de_men_phieu_luu_ky.epub',
      fileSizeBytes: 245000,
      totalWords: 1850,
      totalSentences: 98,
      estimatedDurationMinutes: 12,
      coverUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&auto=format&fit=crop&q=80',
      description: 'Kiệt tác văn học thiếu nhi Việt Nam về bài học trưởng thành, lòng nhân ái và tình bạn bè muôn loài của Dế Mèn.',
    },
    chapters: [
        chapter(
          'dm_ch1',
          1,
          'Chương 1: Tôi sống độc lập từ thuở bé - Bài học đường đời đầu tiên',
          `Tôi sống độc lập từ thuở bé. Ấy là tục lệ lâu đời trong họ dế chúng tôi. Vả lại, mẹ thường bảo chúng tôi rằng: "Phải như thế để các con biết kiếm ăn một mình cho quen đi. Con cái mà cứ quấn quýt lấy bố mẹ thì chỉ sinh ra tính ỷ lại, sau này không làm nên trò trống gì đâu".

Bởi thế, lứa sinh nào cũng vậy, đẻ xong là mẹ dẫn chúng tôi đi quanh quẩn mấy hôm, rồi đưa mỗi đứa vào một cái hang đất con bên bờ cỏ. Thế là bắt đầu cuộc đời tự lập!

Tôi có một đôi càng mẫm bóng. Những cái vuốt ở chân, ở khoeo cứ cứng dần và nhọn hoắt. Thỉnh thoảng, muốn thử sự lợi hại của những chiếc vuốt, tôi co cẳng lên, đạp phanh phách vào các ngọn cỏ. Những ngọn cỏ gãy rạp, y như có nhát dao vừa lia qua. Đôi cánh tôi, trước kia ngắn hủn hoẳn, bây giờ thành cái áo dài kín xuống tận chấm đuôi. Mỗi khi tôi vũ lên, đã nghe tiếng phành phạch giòn giã.

Lúc tôi đi bách bộ thì cả người tôi rung rinh một màu nâu bóng mỡ soi gương được và rất ưa nhìn. Đầu tôi to ra và nổi từng tảng, rất bướng. Hai cái răng đen hủm lúc nào cũng nhai ngoàm ngoạp như hai lưỡi cối xay gỗ làm việc. Sợi râu tôi dài và uốn cong một vẻ rất đỗi hùng dũng. Tôi lấy làm hãnh diện với bà con về cặp râu ấy lắm. Cứ chốc chốc tôi lại trịnh trọng và khoan thai đưa cả hai chân trước lên vuốt râu.

Tôi đi đứng oai vệ. Mỗi bước đi, tôi làm điệu dún dẩy các khoeo chân, rung lên rung xuống hai chiếc râu. Cho cả tôi là một anh chàng dế kiêu ngạo! Nhưng ôi thôi, cái tính kiêu ngạo hống hách ấy đã đem đến cho tôi một tai họa khủng khiếp...`,
          {
            wordCount: calculateStats(`Tôi sống độc lập từ thuở bé...`).words,
            estimatedDurationSeconds: 150,
          },
        ),
        chapter(
          'dm_ch2',
          2,
          'Chương 2: Người hàng xóm Dế Choắt và tai họa trêu chị Cốc',
          `Bên cạnh hang tôi có một anh bạn trạc tuổi tôi tên là Dế Choắt. Nhưng Dế Choắt lại ốm yếu, gầy gò đến phát tội nghiệp.

Người gầy nhẳng gầy nhẳng như một gã nghiện thuốc phiện. Cánh ngắn củn đến giữa lưng, hở cả mạng sườn như người cởi trần mặc áo gi-lê. Đôi càng bè bè, trông nặng nề dở hơi. Râu ria gì mà cụt có một mẩu, mặt mũi lúc nào cũng ngơ ngơ ngác ngác. Đã vậy, tính nết lại ăn xổi ở thì, đào cái tổ nông toét sát mặt đất, hễ có mưa to là nước tràn vào ngập ngụa.

Một hôm, tôi thấy chị Cốc béo tròn đang rỉa lông rỉa cánh bên bờ ao. Nổi máu nghịch dại, tôi rủ Dế Choắt: "Này Choắt, mày có dám trêu chị Cốc kia không?". Dế Choắt xua tay van lạy: "Thôi lạy anh, em yếu đuối thế này, chị ấy mổ cho một nhát thì em toi đời!".

Tôi khinh khỉnh cười bảo: "Mày nhát như thỏ đế! Xem tao đây này!". Đoạn tôi núp sâu vào hang rồi cất giọng hát vang véo von: "Cái Cò, cái Vạc, cái Nông / Ba con cùng béo vặt lông con nào? / Vặt lông cái Cốc cho tao / Tao nấu, tao nướng, tao xào, tao ăn!".

Chị Cốc nghe thấy tức giận lồng lộn, giương cánh bay sà xuống tìm kiếm. Tôi chui tọt vào tận đáy hang nằm im thin thít. Không thấy ai, chị Cốc nhìn vào miệng hang bên cạnh thấy Dế Choắt đang thở thoi thóp vì sợ. Chị Cốc giận dữ giáng mỏ sắt xuống lưng Dế Choắt một cú như búa bổ. Sau tiếng thét đau đớn, Dế Choắt nằm quằn quại...`,
          {
            wordCount: 280,
            estimatedDurationSeconds: 160,
          },
        ),
    ],
  },
  {
    metadata: {
      title: 'Hoàng Tử Bé (Le Petit Prince)',
      author: 'Antoine de Saint-Exupéry',
      language: 'vi',
      format: 'mobi',
      fileName: 'hoang_tu_be.mobi',
      fileSizeBytes: 312000,
      totalWords: 1420,
      totalSentences: 82,
      estimatedDurationMinutes: 9,
      coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=500&auto=format&fit=crop&q=80',
      description: 'Cuốn sách bất hủ nhắc nhở người lớn về những điều cốt lõi vô hình chỉ có thể nhìn thấy rõ bằng trái tim.',
    },
    chapters: [
        chapter(
          'hbt_ch1',
          1,
          'Chương 1: Bức tranh trăn nuốt voi và người phi công rơi trên sa mạc',
          `Năm tôi lên sáu tuổi, một lần nọ tôi nhìn thấy một bức tranh tuyệt vời trong một cuốn sách viết về rừng già nguyên thủy. Bức tranh vẽ một con trăn lớn đang nuốt chửng một con thú dữ.

Cuốn sách giải thích: "Loài trăn nuốt trọn con mồi mà không cần nhai. Sau đó chúng không cử động được nữa và ngủ li bì suốt sáu tháng để tiêu hóa".

Tôi bèn suy nghĩ rất nhiều về những cuộc phiêu lưu trong rừng rậm, rồi với một cây bút chì màu, tôi đã vẽ được bức tranh đầu tiên trong đời. Đó là Bức tranh Số Một của tôi.

Tôi đem kiệt tác ấy khoe với những người lớn và hỏi xem họ có thấy sợ không. Họ ngạc nhiên đáp: "Tại sao một cái mũ lại làm cho người ta sợ được nhỉ?". Bức tranh của tôi đâu có vẽ cái mũ! Nó vẽ một con trăn lớn đang tiêu hóa một con voi bên trong bụng!

Để người lớn hiểu, tôi bèn vẽ Bức tranh Số Hai: vẽ rõ con voi nằm gọn trong bụng trăn để họ nhìn xuyên qua. Nhưng người lớn lại khuyên tôi nên dẹp những bức vẽ trăn đóng bụng hay mở bụng sang một bên, mà hãy chú tâm vào môn Địa lý, Lịch sử, Toán học và Ngữ pháp. Thế là từ năm sáu tuổi, tôi đã từ bỏ một sự nghiệp hội họa rực rỡ...`,
          {
            wordCount: 260,
            estimatedDurationSeconds: 140,
          },
        ),
        chapter(
          'hbt_ch2',
          2,
          'Chương 2: Bí mật của chú cáo và bông hoa hồng duy nhất',
          `Đó là lúc chú Cáo xuất hiện.

- "Xin chào!" - Cáo cất tiếng.
- "Xin chào!" - Hoàng Tử Bé lịch sự đáp rồi quay lại nhìn, nhưng không thấy ai.
- "Tôi ở đây này," - giọng nói vang lên, - "ngay dưới gốc cây táo..."
- "Cậu là ai thế?" - Hoàng Tử Bé hỏi. - "Cậu xinh xắn quá!"
- "Tôi là một con Cáo," - Cáo đáp.
- "Lại đây chơi với tôi đi," - Hoàng Tử Bé đề nghị. - "Tôi đang buồn quá..."
- "Tôi không thể chơi với cậu được," - Cáo nói. - "Tôi chưa được cảm hóa."
- "À! Thứ lỗi cho tôi," - Hoàng Tử Bé ngập ngừng. Nhưng sau một lúc suy nghĩ, cậu hỏi thêm: - "‘Cảm hóa’ nghĩa là gì?"

- "Đó là một việc đã bị lãng quên từ lâu lắm rồi," - Cáo giải thích. - "Nó có nghĩa là ‘tạo nên những mối ràng buộc’..."
- "Tạo nên những mối ràng buộc ư?"
- "Đúng thế," - Cáo nói. - "Bây giờ đối với tôi, cậu chỉ là một cậu bé giống như trăm ngàn cậu bé khác. Và tôi chẳng cần gì đến cậu. Cậu cũng chẳng cần gì đến tôi. Nhưng nếu cậu cảm hóa tôi, hai ta sẽ cần đến nhau. Đối với tôi, cậu sẽ trở thành duy nhất trên đời. Và đối với cậu, tôi cũng sẽ là duy nhất trên cõi đời này..."

Và lúc chia tay, Cáo đã tặng cho cậu một bí mật đơn giản nhưng vô cùng sâu sắc:
"Người ta chỉ có thể nhìn thấy thật rõ ràng bằng trái tim. Những điều cốt yếu thì mắt trần không thể nhìn thấy được. Chính thời gian cậu dành cho bông hoa hồng của cậu mới làm cho bông hoa của cậu trở nên quan trọng đến thế!"`,
          {
            wordCount: 310,
            estimatedDurationSeconds: 180,
          },
        ),
    ],
  },
];
