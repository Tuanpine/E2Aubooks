import { DownloadableTTSModel } from '../types/models';

export const VERIFIED_TTS_MODELS: DownloadableTTSModel[] = [
  // ====================================================
  // VIENEU-TTS v3 TURBO (LATEST BILINGUAL - NVIDIA CUDA)
  // ====================================================
  {
    id: 'vieneu-tts-v3-turbo',
    name: 'VieNeu-TTS v3 Turbo (48kHz High-Fidelity)',
    engine: 'vieneu',
    author: 'Phạm Nguyễn Ngọc Bảo (pnnbao-ump)',
    repoUrl: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo',
    license: 'Apache 2.0',
    totalSizeBytes: 261868542, // sum of files below
    recommendedHardware: 'NVIDIA GPU (CUDA / TensorRT) hoặc CPU đa nhân mạnh',
    hardwareType: 'NVIDIA CUDA',
    vramRequiredMB: 3500,
    description:
      'Mô hình VieNeu-TTS v3 Turbo chính thức (48kHz, ~262MB), 10 giọng đọc Việt Nam chất lượng cao. Đây là bản weights đúng cho engine v3 Turbo.',
    isInstalled: false,
    installedSizeBytes: 0,
    status: 'not_installed',
    files: [
      {
        fileName: 'model.safetensors',
        url: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/model.safetensors',
        sizeBytes: 261835312,
        description: 'Trọng số Safetensors VieNeu v3 Turbo chất lượng cao',
      },
      {
        fileName: 'tokenizer.json',
        url: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/tokenizer.json',
        sizeBytes: 22412,
        description: 'Bộ mã hóa Tokenizer âm vần (text_vocab_size 419)',
      },
      {
        fileName: 'config.json',
        url: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/config.json',
        sizeBytes: 1553,
        description: 'Cấu hình tham số mô hình VieNeu v3 Turbo',
      },
      {
        fileName: 'special_tokens_map.json',
        url: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/special_tokens_map.json',
        sizeBytes: 855,
        description: 'Token đặc biệt (emotion, speaker reserved ids 13-42)',
      },
      {
        fileName: 'tokenizer_config.json',
        url: 'https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo/resolve/main/tokenizer_config.json',
        sizeBytes: 8410,
        description: 'Cấu hình tokenizer kèm chat template',
      },
    ],
  },

  // ====================================================
  // META MMS VIETNAMESE (VITS)
  // ====================================================
  {
    id: 'mms-tts-vie',
    name: 'Meta MMS Vietnamese Neural TTS',
    engine: 'mms',
    author: 'Meta AI & Hugging Face',
    repoUrl: 'https://huggingface.co/facebook/mms-tts-vie',
    license: 'CC-BY-NC 4.0',
    totalSizeBytes: 145274081, // ~145 MB
    recommendedHardware: 'CPU / GPU (Hỗ trợ tiếng Việt tự nhiên)',
    hardwareType: 'CPU / GPU',
    vramRequiredMB: 1000,
    description:
      'Mô hình Text-to-Speech tiếng Việt chính thức của Meta AI (MMS Project), phát âm chuẩn từ vựng tiếng Việt với ngữ điệu tự nhiên.',
    isInstalled: false,
    installedSizeBytes: 0,
    status: 'not_installed',
    files: [
      {
        fileName: 'model.safetensors',
        url: 'https://huggingface.co/facebook/mms-tts-vie/resolve/main/model.safetensors',
        sizeBytes: 145271288,
        description: 'Trọng số mô hình Safetensors tiếng Việt',
      },
      {
        fileName: 'config.json',
        url: 'https://huggingface.co/facebook/mms-tts-vie/resolve/main/config.json',
        sizeBytes: 1641,
        description: 'Cấu hình mô hình VITS tiếng Việt',
      },
      {
        fileName: 'vocab.json',
        url: 'https://huggingface.co/facebook/mms-tts-vie/resolve/main/vocab.json',
        sizeBytes: 1152,
        description: 'Từ điển âm tiết tiếng Việt',
      },
    ],
  },

  // ====================================================
  // KOKORO-VIETNAMESE (ONNX, 14 giọng tiếng Việt)
  // ====================================================
  {
    id: 'kokoro-vietnamese',
    name: 'Kokoro Vietnamese (14 giọng tiếng Việt, 24 kHz)',
    engine: 'kokoro',
    author: 'contextboxai / iamdinhthuan',
    repoUrl: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese',
    license: 'Apache 2.0',
    totalSizeBytes: 333069037, // ~333 MB
    recommendedHardware: 'CPU đa nhân (ONNX) hoặc NVIDIA GPU',
    hardwareType: 'CPU / GPU',
    vramRequiredMB: 500,
    description:
      'Bản fine-tune tiếng Việt của Kokoro-82M: 14 voice pack tiếng Việt, đọc đúng thanh điệu qua bộ chuyển ngữ âm vig2p. Chạy ONNX trên CPU nên không cần GPU.',
    isInstalled: false,
    installedSizeBytes: 0,
    status: 'not_installed',
    files: [
      {
        fileName: 'kokoro_vi.onnx',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/kokoro_vi.onnx',
        sizeBytes: 325731953,
        description: 'Mô hình ONNX (24 kHz, đơn âm)',
      },
      {
        fileName: 'config.json',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/config.json',
        sizeBytes: 2351,
        description: 'Cấu hình kiến trúc + từ vựng 178 âm vị',
      },
      {
        fileName: 'voices.json',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voices.json',
        sizeBytes: 1276,
        description: 'Danh sách 14 voice pack kèm tên hiển thị',
      },
      {
        fileName: 'voicepacks/diem_trinh.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/diem_trinh.pt',
        sizeBytes: 523838,
        description: 'Voice pack Diễm Trinh',
      },
      {
        fileName: 'voicepacks/hung_thinh.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/hung_thinh.pt',
        sizeBytes: 523838,
        description: 'Voice pack Hưng Thịnh',
      },
      {
        fileName: 'voicepacks/mai_linh.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/mai_linh.pt',
        sizeBytes: 523824,
        description: 'Voice pack Mai Linh',
      },
      {
        fileName: 'voicepacks/mai_loan.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/mai_loan.pt',
        sizeBytes: 523824,
        description: 'Voice pack Mai Loan',
      },
      {
        fileName: 'voicepacks/manh_dung.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/manh_dung.pt',
        sizeBytes: 523831,
        description: 'Voice pack Mạnh Dũng',
      },
      {
        fileName: 'voicepacks/my_yen.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/my_yen.pt',
        sizeBytes: 523746,
        description: 'Voice pack Mỹ Yến',
      },
      {
        fileName: 'voicepacks/ngoc_huyen.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/ngoc_huyen.pt',
        sizeBytes: 523838,
        description: 'Voice pack Ngọc Huyền',
      },
      {
        fileName: 'voicepacks/phat_tai.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/phat_tai.pt',
        sizeBytes: 523824,
        description: 'Voice pack Phát Tài',
      },
      {
        fileName: 'voicepacks/thanh_dat.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/thanh_dat.pt',
        sizeBytes: 523831,
        description: 'Voice pack Thành Đạt',
      },
      {
        fileName: 'voicepacks/thuc_trinh.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/thuc_trinh.pt',
        sizeBytes: 523838,
        description: 'Voice pack Thục Trinh',
      },
      {
        fileName: 'voicepacks/tuan_ngoc.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/tuan_ngoc.pt',
        sizeBytes: 523831,
        description: 'Voice pack Tuấn Ngọc',
      },
      {
        fileName: 'voicepacks/storyvert.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/storyvert.pt',
        sizeBytes: 523831,
        description: 'Voice pack storyvert',
      },
      {
        fileName: 'voicepacks/duc_an.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/duc_an.pt',
        sizeBytes: 523746,
        description: 'Voice pack Đức An',
      },
      {
        fileName: 'voicepacks/duc_duy.pt',
        url: 'https://huggingface.co/contextboxai/Kokoro-Vietnamese/resolve/main/voicepacks/duc_duy.pt',
        sizeBytes: 523817,
        description: 'Voice pack đức duy',
      },
    ],
  },
];
