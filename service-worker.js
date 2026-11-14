'use strict';

const VERSION = 'de4890a587fbd07d299c4ce9';
const PRECACHE = [{"path":"LICENSE.wine-assembly","bytes":1074,"sha256":"bd001ff0dfcd13740ccdad6d3972c673d70042be601efe498d2bffe677ef1416"},{"path":"app-update.js","bytes":2838,"sha256":"c324faee3d9f2d602ccb3f8c7b0fc7109aeb0dd2a5582dc7183a62a4fd7f4fcb"},{"path":"build-confirm.png","bytes":1831,"sha256":"0699907bf7f9b71625c84eb542832beb42ecd5128e61db45a5208445906088ce"},{"path":"build-info.js","bytes":106,"sha256":"e0d1fed86148aadbc29c0ee701790785109c651d58e47f145d26a396f0271630"},{"path":"build/nfs2se-browser.json","bytes":9322,"sha256":"7022d85d9b8fd801ca391c6bbf0219a2cb5a1bbc8b11ec4d966c2eddfcc750b0"},{"path":"build/wine-assembly.compat.wasm","bytes":2185950,"sha256":"01db684a6247bdaa19db6d54c8638f32a05b13920b56b64a3139ea1ecf62293b"},{"path":"build/wine-assembly.wasm","bytes":2183304,"sha256":"c02c439fc24e7072e179ff1799db3d13fb99e7eff9c78907bf1ff1203b072529"},{"path":"compact-aac.LICENSE","bytes":26517,"sha256":"246041b6ecf9bc32d718a62c57877c78b5eb397b6467e74ed7ae2626ab189c30"},{"path":"compact-aac.mjs","bytes":16729,"sha256":"3d6a0dcd450c99d488293e65e90f050eb9acb221ced033c53f0465dba8f2d5e9"},{"path":"compact-aac.wasm","bytes":736412,"sha256":"6db983a1be8bc0fd9b9bc2bb7dc263b1060d564f641b1c6c8237159d683e9599"},{"path":"compact-assets.js","bytes":7007,"sha256":"bc09059e1d6a335144e79379c0bd8698d89096679f6454ab09b1eb0d799e8a57"},{"path":"compact-language.js","bytes":9486,"sha256":"bea24d1510866f703af2e48a5925724eab816955de166cddc7278b2822668f3a"},{"path":"compact-language.json","bytes":102156,"sha256":"cf378b0526f569025857ac1f811935a54d7599fe32bf762cfce79b09531fc36b"},{"path":"compact-manifest.json","bytes":118206,"sha256":"fee772a39b48c3a625afdb562b9d7222d0e50547265347261253fc62b32df569"},{"path":"compact-plan.js","bytes":6839,"sha256":"6606ada023a58494e71fd7346ca3d550b8de31affafc36b61be9a78c1ffd27a7"},{"path":"fonts/Courier.fon","bytes":4816,"sha256":"51dd54b23b9857032faac1ab672d7c788b657752ea0b2d0cc39a9f727a607457"},{"path":"fonts/FSEX302.ttf","bytes":580724,"sha256":"842f8fbf80f57d867aeb1d2988140d3ea8b4718e5f687035b0a3b66756df3899"},{"path":"fonts/Fixedsys.fon","bytes":5264,"sha256":"2b5cf71bfbadbc460f79fb5b2d8bf1650a7e148359fcb6064392b4a28fadd3c4"},{"path":"fonts/MSSansSerif.fon","bytes":20128,"sha256":"e038cf667907c0a75a59e172191c718e1d30e7e006915b55afd3411b72335cc4"},{"path":"fonts/System.fon","bytes":13456,"sha256":"2f41afc0ea1d2ac4361fea4bfe4cd4eac5cb99627f1e7ee185ec9f5d1980f94b"},{"path":"fonts/Terminal.fon","bytes":5168,"sha256":"dccca736742e4c1bf0b6a98393417c07f6e46ef0ecb2030cec0ebddb2369d4e1"},{"path":"fonts/substitutions.json","bytes":11587,"sha256":"877ebe71ce19dfe78514d70ae1c2622d00fc8e02da5ae3b055cb9fd6c714cdcd"},{"path":"fonts/w95fa.woff2","bytes":7880,"sha256":"d81cbd6c15b9695e614fe1674bc1f43fa79c820afd0cd4acf49955d065e71644"},{"path":"game-bootstrap.js","bytes":4140,"sha256":"01f3345a04af5f8ce328b4df7712bc85cc21597288e8a7bf1eb2b3eb063a0805"},{"path":"game.html","bytes":185271,"sha256":"198fa7f1dac4f0c0f44540f9508ac9fade8b5659a6b99cadd359316360376526"},{"path":"host.js","bytes":387926,"sha256":"3991b8cffebb5704dd805d218b76bbb4c9a11ed4328acd44fc261bd2a9dc1b43"},{"path":"icons/apple-touch-icon.png","bytes":38934,"sha256":"6725a8f76de20aabf2d566a79ec3e9a954a6342b8b7754576291343552d03c49"},{"path":"icons/ui/account.png","bytes":741,"sha256":"b29e0d5db2b8259c701621e114a7b8615440ffdf7565487ea766f5b0f3c22703"},{"path":"icons/ui/add-game.png","bytes":453,"sha256":"984e7b5ca42b506d1d7217d39c2a90d395582d10055e09851dee801bcb1db678"},{"path":"icons/ui/agent.png","bytes":390,"sha256":"fe5426bc67f2f92ddebcfa6df52a6b29f20e9c5540813c3f83bc309de76ed321"},{"path":"icons/ui/apps.png","bytes":901,"sha256":"985e2ac1b35dbf33af6e31fedc5b99ee7c6b133310ebc2e29545a233152641dc"},{"path":"icons/ui/berrry.png","bytes":639,"sha256":"296e6acfc351dc0c4bdbb9fb93ffee3ca16702309014fdede316329e1fc83fbb"},{"path":"icons/ui/debug.png","bytes":771,"sha256":"4e72aae9cbf3cd8df498aa6325d488fb11a2bcc35ef6a3d42594dadef16e113a"},{"path":"icons/ui/design.png","bytes":763,"sha256":"7b105cd3b952451cc8cc97cc8f4f4f9e34155ae042487dafe43a141e83bc97d6"},{"path":"icons/ui/github.png","bytes":726,"sha256":"8dbb9f081bde2f4bf97ef5cc6d15078c5e328c8346d709cb6ca3999cb025ea66"},{"path":"icons/ui/readme.png","bytes":164,"sha256":"c38a85fff7178500f0aa290813414a606eafbb8016ffe6d5ffb2f15e833f9ac8"},{"path":"icons/ui/story.png","bytes":1067,"sha256":"784216e850ece0e58b0547311da21f9a8c58a9880eb11d7cba4894c34e456c1c"},{"path":"icons/warcraft2-180.png","bytes":38934,"sha256":"6725a8f76de20aabf2d566a79ec3e9a954a6342b8b7754576291343552d03c49"},{"path":"icons/warcraft2-192.png","bytes":43526,"sha256":"274fda467a7faccbf19529dc58d854c117d6e0fc745da8875b618a2dd64e9708"},{"path":"icons/warcraft2-48.png","bytes":4010,"sha256":"1087ac67e821df11037e0301d3f9582ccacdac3ad2c165116e9b9ea7b616e284"},{"path":"icons/warcraft2-512.png","bytes":203728,"sha256":"92085a3df164d95d5cf5c8f68fe2c401779f3a66f28515b23eadbb935d0f9415"},{"path":"index.html","bytes":1768,"sha256":"1f727418375f2fae3a92d798d2e0547d2fa34d57c6638b64928dcd18509c186c"},{"path":"install.js","bytes":3035,"sha256":"5f95cba9f58c4de29e33b2301359720dca18951072fb9a79336125edf55224c6"},{"path":"lib/agent-connect-ui.js","bytes":19998,"sha256":"1b0df6ce6774d2836113ae5c26482fb16ea89d4a87cc88cc163d3eaaf4532441"},{"path":"lib/agent-connect.js","bytes":10563,"sha256":"d1f75b67c056fc7d7305265d8888783bbb9c1bd0557a3073af1c1d966376fe90"},{"path":"lib/agent-pair.js","bytes":15985,"sha256":"ea65283149a177180badc7693aaccf1c93fad369afc0edd3ca8e5fc9ff5b5f54"},{"path":"lib/agent-remote.js","bytes":25007,"sha256":"a26fa6c5fefdc605413431386818fd437f916ba7fbe41595547caf5d02ab5c12"},{"path":"lib/app-file-sizes.generated.js","bytes":304086,"sha256":"bbc52e0d30bc92a16738b00ead1630bcc6368067e4d83bf5f592e24ab3b20056"},{"path":"lib/app-files.js","bytes":16426,"sha256":"4c1ce40b92aa990a4bc689bd98d5c0d92ab3af44dafeb93ca52ccbaf2c6124f7"},{"path":"lib/app-icon-manifest.json","bytes":3703,"sha256":"ad0de39dc85d82d1bfea52f82f6c6cd74504e7176a5f8db742e7b7a3fa726d87"},{"path":"lib/app-profiles.js","bytes":18930,"sha256":"8798f81a53fb45b89c54c4864fec96181a3f01c76bb8e73c229719535c5c45a8"},{"path":"lib/apps.js","bytes":442643,"sha256":"1b5bacabc1d5ae970371d1129c698ddc37ed1acc8382f530b9d86dea1eb7454a"},{"path":"lib/audio-voice-worklet.js","bytes":10257,"sha256":"da695e5a3c469718c3734a568666e01bacc4ab83467ad7465b35a24376d2a6ca"},{"path":"lib/audio-worklet-host.js","bytes":14592,"sha256":"710fe1ede2bfcebbf0378109a755705f68a5792881669937e08430ec3d49cd14"},{"path":"lib/browser-input.js","bytes":63151,"sha256":"5b2c47fa0b901f0323bc04df34ff27d8c50e47a001d77e9dcae3f2986a3477f0"},{"path":"lib/browser-shell.js","bytes":215021,"sha256":"f7ab0229e78936e9e8a09f0f17c3261ece09da676beb98bf7501cdcc6c120086"},{"path":"lib/byte-provider.js","bytes":35492,"sha256":"2a1f857d7eb653add0fcf8f10b4bf52fbc21316bce46368ef5ed32c90065b9ce"},{"path":"lib/cdrom.js","bytes":14034,"sha256":"99020671e2b3f3eaca930d4acad0d502ed33d5295fadaaa28d32736c6a0c6727"},{"path":"lib/compile-wat.js","bytes":72471,"sha256":"4aae3c6ecd7949c37fcea28c9d5678b8f24038fdef9ff5bb63458cc08a198f52"},{"path":"lib/d3d-command-stream.js","bytes":55436,"sha256":"3e4849d71fab44fd2657049f0176bb0100ee082184b354b556c2e40b0632fd39"},{"path":"lib/d3d-geometry-batches.js","bytes":3149,"sha256":"2d585ef05cc7377d54e6b71b28b2cbdea721d966c88dc03659e4a44bd33115dc"},{"path":"lib/d3d-render-worker.js","bytes":28893,"sha256":"838ae4a486c196571b214fe849e9670d52447059af9173339b8c7855a8560cc7"},{"path":"lib/d3d-shader-ir.js","bytes":15243,"sha256":"9ada4145c3c585418c841e605332622ccbba101805d66750dd57ce213b452056"},{"path":"lib/d3d9-backend.js","bytes":82998,"sha256":"f0ced4789775a3dd691d147bbb3b0808fe40ce07025e93e5c1663753921971ee"},{"path":"lib/d3d9-fixed.js","bytes":31351,"sha256":"5e3a7a421f5d11309be694cd1f167d36e27cee9130d8415ab22689c69867025d"},{"path":"lib/d3d9-host.js","bytes":103313,"sha256":"a0f63e0cb4773a799f93b4b37c8fda178aaa7f7ed553de10d523d5e3d14083f2"},{"path":"lib/d3d9-shader.js","bytes":50068,"sha256":"63bf3bae9ec20e74bee1cd3a4b6ff6e57291871feaa958c50d056073a22b2489"},{"path":"lib/d3d9-software-backend.js","bytes":88674,"sha256":"4737282316277edd7b7b3b07c61bbadc73ca09bce6781731659c176f47e05dcc"},{"path":"lib/d3d9-texture.js","bytes":3107,"sha256":"76fb654acd7601d767d7edd3b7146df11348bd9168175a3fe2be328c21a22d0e"},{"path":"lib/d3dim-gpu.js","bytes":65631,"sha256":"2edd079e604fcaf322ed544c8cc38ff5585a51b1fcedf41172d81ff02e2613cc"},{"path":"lib/debug-app-picker.js","bytes":15387,"sha256":"eaf2d515f27f9db641541c32bcb3307eecb9645fd08623eff906b1f0c3d58565"},{"path":"lib/debug-midi.js","bytes":7275,"sha256":"75195abb8fcbc41511f4c4349284e2545e98f5ba39e533beae86ca527e7f70ae"},{"path":"lib/debug-thread-state.js","bytes":24222,"sha256":"f5e1a00527797b129d2e27fc43ba6f77b9dfd9c3b4ba0c0d3d26e9356cd037b9"},{"path":"lib/dib.js","bytes":12071,"sha256":"63a6045429754293b6fb826309110e36b75a0984e93d663baa9e612654d79a34"},{"path":"lib/dispatch-trampoline.js","bytes":5332,"sha256":"21267e1bec969169b1a7a619e7fee03514a88957ac9abfcc63ba0c0905a910af"},{"path":"lib/dll-loader.js","bytes":110859,"sha256":"a821356728a03e63c97591a847f1d727dbc68472450de1edd30cf39250ab8f6d"},{"path":"lib/dll-registry.js","bytes":7786,"sha256":"a0150d46bb48d538543569317baad34d1fcba0ecbf85981670c28b404ab51a14"},{"path":"lib/filesystem.js","bytes":158109,"sha256":"542ecac68e15882d9f5455e89c2c92198d3e3042b53b599b29706a6668fcb3b1"},{"path":"lib/font-substitutions.js","bytes":4704,"sha256":"4112564a27edd7b100230c94230eab80c4dfe1a989ad263183416b2085457141"},{"path":"lib/game-wait.js","bytes":10829,"sha256":"171b78283e425597b95777a58bdf7387a37f50e91b6320de6b8c865f092a0999"},{"path":"lib/gdi-surface.js","bytes":20704,"sha256":"d8c4b0ff4050c5ee3ebff4de9efd34609d2717617ede0a02cd1e2d916ffea9ff"},{"path":"lib/gl-command-stream.js","bytes":10672,"sha256":"a35fb9a3cbb1b678ca8591748af761cd131a21c610623a3840999fed56bfb543"},{"path":"lib/gl-compat.js","bytes":220950,"sha256":"0f412cc4bf9b5109dbceebfd677baeb6751e5d337cde0e1fc68230c7debef1f8"},{"path":"lib/gl-render-host.js","bytes":16448,"sha256":"5893f46d2f7866facbe2a0b93ce6d64cf7c51299045a3356fb3abac350350ed3"},{"path":"lib/glide-backend.js","bytes":41345,"sha256":"4c0fccb77d6046415221c7e2c5d7af3edcb48b12b706a4164be02382efae7be3"},{"path":"lib/glide-host.js","bytes":17793,"sha256":"c631807930cc3d2b693c21a3e4bd6819284c75b096ff7dde7915a07e7e715b89"},{"path":"lib/glide-software.js","bytes":27955,"sha256":"a541a16ad0594faefced64f89d9a09e7f12b295b2631d81df39eb9f1b6ddda46"},{"path":"lib/gpu-backend.js","bytes":87230,"sha256":"ba6d9309ee591c27afa85f19a9364a77ae5bca87e8899c138ea75ae8e4b9570d"},{"path":"lib/guest-rpc.js","bytes":73413,"sha256":"65cb2ceeb9700bd904d3d57dbc3fc649ce5bf88ce497b48a9d48733f7c7e3b35"},{"path":"lib/guest-thread-host.js","bytes":80432,"sha256":"f05d070af7c0505c1289e7f658453aabfec3777b8979f6eb4a51d7af8ed84794"},{"path":"lib/guest-worker.js","bytes":79948,"sha256":"f78314bbadce2d42aab0581bc293112cf6440386f9a1049c4ca421d9224a3340"},{"path":"lib/host-audio.js","bytes":209600,"sha256":"dfb70fe9425e93d5bdde11f530d2958af99ba2235619b2ffbe1fc62651b71c06"},{"path":"lib/host-import-sigs.generated.json","bytes":40254,"sha256":"c40276f9e88fd6e80953c9c09ca4cb134520887b0f80cfdd26920af96ab9ac98"},{"path":"lib/host-imports.js","bytes":199086,"sha256":"cfa31fc1ef3774dcf7351d2f561b4d8cf8ade85704d305abbd05223938518628"},{"path":"lib/host-window.js","bytes":64233,"sha256":"5866d86cd38e1d5a86bdb6bebe24816efeb7246f5c632e2613a8d5fdcee4a39b"},{"path":"lib/installed-shortcuts.js","bytes":5423,"sha256":"a5f15467cf6309532ca65b8b4a304121f2dcd71dd176e0154d358e17fa30ac9e"},{"path":"lib/iso9660.js","bytes":23867,"sha256":"c840f7b10a3cd02ba4c122db7a37876088d6062adfbde2fed297d520ad51d544"},{"path":"lib/launch-progress.js","bytes":39200,"sha256":"4496dafb7b15c7801ad5a0b3eafd3773b1530a68e1c51758abd7b2171e13a492"},{"path":"lib/main-io-wait.js","bytes":4159,"sha256":"41c30f3509232a895b791d5fcaa323e8ed19e58c1985362b5ed1577489ac9ea5"},{"path":"lib/media-import-ui.js","bytes":50466,"sha256":"87ccbe12f99bb4b5ec3b7ec9b2a2bf879458fcf464c6fbb5ecff54704c2cb869"},{"path":"lib/media-import.js","bytes":37173,"sha256":"016c7188b954ace6f573b6fdfb3ff383617b40311bcba45635ad4db77b8d1d47"},{"path":"lib/media-library.js","bytes":24163,"sha256":"0915c4d7b2d29ff905a2e811426f59463a64d18b75e452ed5b399fdfa9f668d3"},{"path":"lib/media-sniff.js","bytes":7648,"sha256":"0fd8b8269258d4664e52edeec70a9d1f7383b35bc361fd390e6c6e3713b7993f"},{"path":"lib/mem-utils.js","bytes":13470,"sha256":"c1164402fac449f7006c11acb557cfc70c7a2d4bf298c9fc61fea9cf3b4b4580"},{"path":"lib/mobile-keyboard.js","bytes":11915,"sha256":"d8822c5dd20a6b2ef6d9df12af0f8d1b2f2ae2872b8fd1bfa21b276e0cb4f35c"},{"path":"lib/ne-guest-bridge.js","bytes":4652,"sha256":"38f4458597a38719f3d20964039b305016ead8536d7b22a911ae14d4c5da336a"},{"path":"lib/ne-image.js","bytes":7091,"sha256":"5ce051afa41391e63bd88b2084098c52ba515241c02e99a423c6d4f3632be7d0"},{"path":"lib/ne-invoke.js","bytes":5358,"sha256":"c75e1d432ab136b7ed49deaee3886ce224f67bf35e13015e2f4d66dd04e377f5"},{"path":"lib/ne-lifecycle.js","bytes":12104,"sha256":"ee93030db5ac0c85ac1378e600c170dce07fd896acfe6bed5c7cef5fa5677fb4"},{"path":"lib/ne-load-error.js","bytes":676,"sha256":"c4ef6991b40b903833dedbf8fff5d214b882b194dbbca7eb9259dd1c67b800fa"},{"path":"lib/ne-sources.js","bytes":3473,"sha256":"e2c12ce6a3f00dbad4649afe231a18b7cabb7d90369f402f98575f2acf6d60b2"},{"path":"lib/overlay-store.js","bytes":22883,"sha256":"355c04686750794b161b725c00195fc84ea8d89f59a0ab773b4f7f93ecfbc0c9"},{"path":"lib/page-settings.js","bytes":7161,"sha256":"937b21ccf5e3864ca46b08c295899ec5d9e54a56511343839b63616e078b8d32"},{"path":"lib/page-viewport.js","bytes":14609,"sha256":"8ee519c033398a81afdfcac3a1d9b5992e60302b35501e98e86f919ced779108"},{"path":"lib/pe.js","bytes":4787,"sha256":"ef4116c14eb53850cd6b06d88b00ecd173b3dd3e9c90087a092a3aef00038853"},{"path":"lib/perf-hud.js","bytes":38796,"sha256":"7c790bd80d8a06e8e4f9cf81fcf65f4746c04b22ba165b405435b0e0a2d22779"},{"path":"lib/phone-diag.js","bytes":25484,"sha256":"3d3b3e0e2624acbbb0c5a7763261b71173914ef869b3aca20cfabbd695717ff8"},{"path":"lib/presentation-filter.js","bytes":63345,"sha256":"dc2f72eb52688ceaab8f1f4eb597b27a65a9fbd76082af59710525c23591eef0"},{"path":"lib/process-boot.js","bytes":55597,"sha256":"8bdae70282c6f29d1df44d843e8a6eef31da4eca4df4bdaf3a702fac099c8a88"},{"path":"lib/process-send-broker.js","bytes":11076,"sha256":"60747d39426faf69836d711a7019b3ab08479f2521f70bda67ae78e2c601f47a"},{"path":"lib/recorder.js","bytes":19878,"sha256":"555376002e04f3b6998b8f5a0c4b412a699c67ae7f7ed745212c7ccdd046b48d"},{"path":"lib/region-map.generated.js","bytes":37429,"sha256":"1c77faf49487ccec3a580ebdec25e355396c24a088ac2c459370d88a840e991f"},{"path":"lib/render-clear.js","bytes":8347,"sha256":"c1fad9a8ee23d2a0467cf48d390750512fcd9ddd181e7a8ba0b2801dd3a8a32b"},{"path":"lib/render-worker.js","bytes":29000,"sha256":"118bce66c398d0441e63f791e858adc8a19b845351ac70a53d78df590d77b0fa"},{"path":"lib/renderer-input.js","bytes":186466,"sha256":"269d5a670fbca3aa63c3e31a40db0b8f4ef9131e3b06ea5f2b869806a690ded2"},{"path":"lib/renderer.js","bytes":226832,"sha256":"520cbf64656d97955cec0a1062f6d54441e2bd35503a459c073fb389768599f5"},{"path":"lib/resources-icon.js","bytes":20791,"sha256":"103ed8f4e27a00aacb88a1251b148f7db19ae49795d50afbf0f3b1511f5597a5"},{"path":"lib/session-chips.js","bytes":17448,"sha256":"aa9d5103e3c53901a9d7c3e3e567c89b6a42d27843842cffceb6475d0cd81e5c"},{"path":"lib/shell-link.js","bytes":3388,"sha256":"a9db32724bf31dc754e8ea34d304f35420b22cf81440f28fca383cbbc9a34868"},{"path":"lib/shutdown.js","bytes":26778,"sha256":"2ca9baa752f48f6f0c0346232ec86807d47e0728f99c3af4ca0364927e7f3a1e"},{"path":"lib/startup-clock.js","bytes":3363,"sha256":"6810d24149720e60ce6f70366eddf338532af78f6b63ac8eeb4c4c7adc79bcf7"},{"path":"lib/storage.js","bytes":83555,"sha256":"a31f11a6c33b7e4a27f475bebca5e1a48ce4ebde43bd06716bc16a6439cf3df1"},{"path":"lib/surface.js","bytes":14312,"sha256":"78fc5304fe8a51aee13b65e6fef7dcb218c302716dfe46c61c22224fb33bb36b"},{"path":"lib/thread-manager.js","bytes":238402,"sha256":"7f570ce7f98ab5559adb80dd5be06e651c60ec57edff1fe00dbe4979c5189633"},{"path":"lib/thread-send-waits.js","bytes":16614,"sha256":"cb9b33489ff6dfdedd7088a39883420fa1ca81cce5cfbefbc30354a1749b9995"},{"path":"lib/touch-controls.js","bytes":116287,"sha256":"a4277215c2521c16a28e0e8f6866a2d51c3a8c768fea298f0fc95633f2f18e28"},{"path":"lib/touch-cursor.js","bytes":26289,"sha256":"56d3a1373d5a5dd4d984a793b94b6b85c2a52ff3cd040baa4da3d0544bc6a2c0"},{"path":"lib/vendor/tweetnacl.js","bytes":62737,"sha256":"25b9f03f50183864436ccbf16d1d6ae72ed7cdf3330fa9eb0053d369e5962268"},{"path":"lib/vendor/webaudio-tinysynth.js","bytes":62376,"sha256":"65aa9b78b1bdc8cccc1a7e83eb6cfc24310a548cb6be4334096a8fb1d303a52c"},{"path":"lib/vfs-overlay.js","bytes":14961,"sha256":"2d725c5ee5f05ef2f843083b895d4f5fce82223db1db0520db1515e11d28ebb5"},{"path":"lib/vfs-persistence.js","bytes":17509,"sha256":"fc8caa5757face2be6ae9bef9a564d7dfb58fe905d0d7d5fe386ce530cd27351"},{"path":"lib/vfs-seed.js","bytes":8258,"sha256":"c4ea49c788a5c6331cc900742916315e4d5c68cc2a806b947ae26b4814489c1d"},{"path":"lib/vlan-lobby.js","bytes":12355,"sha256":"a368f49ea1feb62107a3a01cd0fa76ccbe086d8b4c8475d3836b17e921db4326"},{"path":"lib/vlan-room.js","bytes":12461,"sha256":"ab5a023cb10bc55ac0398b0a27a875abbc8fb86e915b32031386a3648d92afb8"},{"path":"lib/vlan-rtc.js","bytes":47377,"sha256":"b88a9dea39d562f23cd4ea32b8ffed3fc7916f3f2564166d70726288e7f526ee"},{"path":"lib/vlan-star.js","bytes":19399,"sha256":"73a712b009f28804fa33ade5ccc8d804eccefd72321e678bac5f1c326f97616f"},{"path":"lib/vlan-wire.js","bytes":13813,"sha256":"cea7da7afafb589a9d23631ecdb4bca1a82982dcc1482706cc3d44e1a492fbcf"},{"path":"lib/wat-manifest.js","bytes":2995,"sha256":"37ee6b9a0a29d6445102b81cd462c8a0692a8ab81ea22e909fcdcf34fa148656"},{"path":"lib/watx-compile-worker.js","bytes":17721,"sha256":"166b14a76feb5cef7281927421e085a7fb87c099f7116727df168c195f0143dc"},{"path":"lib/watx-launcher.js","bytes":34797,"sha256":"c219f778dfa6de9086198b0b96edc364af1f3cdf31c70731bef3f1d4b61a5595"},{"path":"lib/worker-imports.js","bytes":22934,"sha256":"a76289294b4fa46ec5a62e97c0a2b4c7f3e1b38df35028ff03b7352b5820de91"},{"path":"lib/zip-mount.js","bytes":32525,"sha256":"0992d15a85a3fa54dbcfe8bdecf2ce1a57e1922beba457f18af438e107e3d274"},{"path":"manifest.webmanifest","bytes":522,"sha256":"8dc94ccd734a3654fa021d10873826755e16642928091c0a96e024603b368cdb"},{"path":"menu-art/human-texture.png","bytes":11647,"sha256":"3c1dcab8b19b3d7f7a9770aba284695bd1b5016c584776a949fa4751d77b33aa"},{"path":"menu-art/label-english.png","bytes":976,"sha256":"77dfccfa01b35da22bb8a430117838d09513fab39242525ce8f0523bcfce3a83"},{"path":"menu-art/label-fast-scenario.png","bytes":1001,"sha256":"ac72cee529f0e55457af7850395074c5694ea33cb8c755589ef6d7b9a771dae6"},{"path":"menu-art/label-language.png","bytes":948,"sha256":"7c4d3254ac4fa43c7280550fa7a805089a234ddcc762ca6ec36a85574ba703ca"},{"path":"menu-art/label-music.png","bytes":818,"sha256":"2387b651e876c7192b80eb9c4b97e1918c2421fac3d5b3085295b5882b969c01"},{"path":"menu-art/label-options.png","bytes":807,"sha256":"2ddd436bd3e32c3bb15a368741196cae94a856d06878aa5cf054213f3559bcaa"},{"path":"menu-art/label-replay-demo.png","bytes":997,"sha256":"4cfa4f17970aa57336627101032f3e90e0d6f033120d30cf70e4f005862ffce1"},{"path":"menu-art/label-ru-fast-scenario.png","bytes":731,"sha256":"3fc64737da405dc77fc6b40ae0a0d371619ea4152a5af86667b7ead70f8828ee"},{"path":"menu-art/label-ru-language.png","bytes":533,"sha256":"1a82c9470915b24c055e65f7cd4351aee58cc4588cc1aa38925c20363dd6c35a"},{"path":"menu-art/label-ru-music.png","bytes":685,"sha256":"5e075fe3b2f9e66ec32a7b73a113371c83e121fbb7a44ae814f12953fe800a1b"},{"path":"menu-art/label-ru-options.png","bytes":699,"sha256":"aff8d1447608cf3113736aecdc08fa662a940cf8d5d5cc183ceb11b8921a7483"},{"path":"menu-art/label-ru-replay-demo.png","bytes":500,"sha256":"c82bd0fc05a7f1e5e667b121fb083db6a1c4b32d09e863ae11d2846317c94267"},{"path":"menu-art/label-ru-sound.png","bytes":525,"sha256":"7a23f7d37eac07b2f15d14be0979981f9e01fd1ca84171a8ee418cb30bed51a9"},{"path":"menu-art/label-ru-story.png","bytes":684,"sha256":"e627fc5725f6af83eb34d295459332874a3bfe8ed5f12579c17d33756af40e02"},{"path":"menu-art/label-russian-text.png","bytes":842,"sha256":"00e103f65127e15a18c7079e7b1955d3433a9c05813f7b1375ef746d989dff2f"},{"path":"menu-art/label-russian.png","bytes":556,"sha256":"843b67d7acf91182b011a867d17fced39d2bcd198ad630c2a6120993dd4b36b7"},{"path":"menu-art/label-sound.png","bytes":812,"sha256":"a0b620519ba7cc0a75102d71b1b5d6256c7121948ef6512516eb6a5227cbafcb"},{"path":"menu-art/label-story.png","bytes":811,"sha256":"ea2838992f18a4aa32471ad076da528cb723b823b601519d94b7e22a6724a8ee"},{"path":"menu-art/language-disabled.png","bytes":646,"sha256":"4b8ea64d93894a83895e897f99daec3cab59944f5e38c3aa7e12c4fff8f65d44"},{"path":"menu-art/language-selected.png","bytes":703,"sha256":"05080314040ddbafdf42ca933d221c377b79d0b9259f95af9f8195c8db31e888"},{"path":"menu-art/language-unselected.png","bytes":686,"sha256":"9a6da5d9d415b8476a95ac78fd6c73c6067493184a1e11465d4f350ac6d2e52c"},{"path":"menu-art/orc-back-pressed.png","bytes":246,"sha256":"5a4239f216ccdcbe591ff92df511bf624f5c970181cfd8af900e23c6a72814b7"},{"path":"menu-art/orc-back.png","bytes":258,"sha256":"7292773883b05b33d4f00cd4429b7909b93a3e9eb2655d417388fd3b9d90e919"},{"path":"menu-art/orc-texture.png","bytes":7191,"sha256":"16a1a95f718104606880e1ab387ed2ba24b2840f23ce71d97455492869843f45"},{"path":"menu-art/title-button-pressed.png","bytes":1201,"sha256":"a07b5e3e2ffb182190dcf4e53aede4090f16fa40ce3ad0de6edef40012f1d4b8"},{"path":"menu-art/title-button.png","bytes":1334,"sha256":"b92bcae296242813209a9cf769301087d1f3749905106ce219bc036ec2118d78"},{"path":"menu-art/volume-digits.png","bytes":1366,"sha256":"4d3eb072cb733d2d6ca532a719873489b1f050ead3fa0b89cf4a8347aeb5c09b"},{"path":"menu-art/volume-thumb.png","bytes":462,"sha256":"b23fe67fa28f549910c3ab6645e37da848d8b897c213bead0e5ca595473cb9eb"},{"path":"menu-art/volume-track.png","bytes":1174,"sha256":"d0a987bca0d57ab4f06e1debc07165388ef2b5ec935955f4840cf63de1cbd31c"},{"path":"movie-pilot.js","bytes":12331,"sha256":"b5ee239fb35d6a2efdf695e04c891cf8ae7b2aebe9fc70753f5055b2ad6980b7"},{"path":"src/api_table.json","bytes":722844,"sha256":"0b97e8e3eda7e19a24a022208deddf03ee414cfef3cc6eb1b07689ad65ae2123"},{"path":"ui/boxedwine/camera-input-gate-v15.js","bytes":1501,"sha256":"f53b056ad862e84792c9db761aa6b98b4a8e94a2681911cd71d48448ad8e9b3c"},{"path":"ui/boxedwine/dune-controls.js","bytes":35839,"sha256":"4fa3f98a38aa9a16247176e2e06402fc0b06f3ff274d59cddfb59af72109968e"},{"path":"ui/boxedwine/full-map-runtime.js","bytes":42277,"sha256":"75a5534be7a231311d2f3c45835148fefc564cfbb282f2b8e4d29242e4c8c41f"},{"path":"ui/boxedwine/input-fence.js","bytes":6014,"sha256":"970b529f6b636eccfd18bea32b93afcc9b90cb16e22c43089199029b262df123"},{"path":"ui/boxedwine/ui-bridge-runtime.js","bytes":22971,"sha256":"6ee87b124e1ceb483b459b0201835715823cc69bb8e75b9a1d3ab1437dc7cf05"},{"path":"ui/boxedwine/viewport-runtime.js","bytes":4142,"sha256":"3904f2b90cceda356d4ac3e12d6bfc36972fb222d288520dee242d5e6b7c8e67"},{"path":"ui/viewport/bootstrap-background-v16.js","bytes":2915,"sha256":"c27c31951d7364e65faee1d27e520f93bebf6357d735a8ff15fda98ff2d4daa8"},{"path":"ui/viewport/cursor-v15.js","bytes":2886,"sha256":"6d6bf9b5d41de0d010120aee1df0a04cc6f6794c8d8d73e0d5f0ccb693e9273e"},{"path":"ui/viewport/hud-foreground.js","bytes":9367,"sha256":"97dcbff03321c6e6140935c2f7f7c61ca82067eac0f2902d80c1f903528dc4f4"},{"path":"ui/viewport/hud-layout.js","bytes":17232,"sha256":"b4ec36e21020e8e2006c55db54f7a7850ff248ee85ca4f8d316ac0322babf7f9"},{"path":"ui/viewport/independent-camera-pilot.js","bytes":7775,"sha256":"1b0b271fb351f8414c5d2fce1f28a36684f444d3ef7a9b1a0b359c33d10108fe"},{"path":"ui/viewport/modal-presentation-v15.js","bytes":14001,"sha256":"7d858e5c36cf40273d8dafb15688c1158bdede73d5b00d9a49c797a781e9f68b"},{"path":"ui/viewport/native-frame-v16.js","bytes":3575,"sha256":"0af730a09d40611428a3c75b4d9606b00617dd33792b90a1528908f1feff0234"},{"path":"ui/viewport/presentation.js","bytes":8951,"sha256":"1220bd2e8ba068d8cfb61d7ed3659a41c5b4c410e185b3dc73031a938ddab301"},{"path":"ui/viewport/smooth-camera.js","bytes":21037,"sha256":"7ddc03e46f08452b4bf2d4c166902e354eb9373d02e46661ec1351a22128df77"},{"path":"ui/viewport/ui-rects.js","bytes":7959,"sha256":"ab3903a1d2834b387b02d468ca26b1729976f4290c67ce4000b5321a8237abc6"},{"path":"ui/viewport/view-state-v16.js","bytes":4190,"sha256":"437e60c91d9c3c9871a93b1ee3c343bfbb86570987dddd3c20e79e24eda407d3"},{"path":"ui/wine-assembly/pilot/warcraft2-briefing-layout.js","bytes":11010,"sha256":"335e564eeda40f01631543c6408642c654d6a52ef0411d28ba381a937c8324a3"},{"path":"ui/wine-assembly/pilot/warcraft2-controls.js","bytes":4103,"sha256":"0bd66f2f9e11e6f07f7f3280445c2f374690c1fc4810d7a114f053b7137c85a6"},{"path":"ui/wine-assembly/pilot/warcraft2-dialog-layout.js","bytes":14965,"sha256":"4f9538b8b9be27e3e8aff61e0d449152e86bc6e58a6aadcf86c0a472632082ee"},{"path":"ui/wine-assembly/pilot/warcraft2-menu-navigation.js","bytes":19551,"sha256":"ce22bc49d9f3038e7fbcd3db1eb08d39a3d61eb1dffc9ffd53e26b81b6dafd9e"},{"path":"ui/wine-assembly/pilot/warcraft2-menu.js","bytes":24602,"sha256":"a623afbebf3da45d3b11970bddcee532eff8868a69e73385babf2f30fb3bfc55"},{"path":"ui/wine-assembly/pilot/warcraft2-v16.js","bytes":7843,"sha256":"b8a67f08f1c38137ad7f8a534ff9e0e40ed17edf110cfdf382a8c93c03755ad5"},{"path":"v16-bridge.dll","bytes":57856,"sha256":"78d6dddcd58d4672f380ae12a26337fbf1fe230030b9c38f80b4f43ebfc2971b"},{"path":"v16-bridge.js","bytes":4905,"sha256":"9bfd7d16dec7ab0aa5f5c2702ad905ecdabd0dd1b561be7784a1da0c13207f7a"},{"path":"v16-movie-pilot.dll","bytes":60928,"sha256":"03aca909dc3d8fb05b2de254cbf8f6c4afb32cadaf44b4a2901df2489d40bd9e"},{"path":"warcraft2-compact-audio.js","bytes":9263,"sha256":"8823c33caae437c13056facdccb617fe9f28904709d6a1d6204b0a11bc8ee061"},{"path":"warcraft2-menu-policy.js","bytes":14647,"sha256":"d1483fb4a5336a6fbf642ae06acb16dba8e9d2e2597e87a98433a94020122361"},{"path":"warcraft2-v16.css","bytes":3544,"sha256":"e8c8fa4706f73ba282a72f2c486a45091d845b708466f7d242c6d48caca33d63"},{"path":"warcraft2.js","bytes":9457,"sha256":"9c4c48aef356d30a70234313fbc0987a91c050dd763069cf4a0debd7aa8600a3"}];

const scope = new URL(self.registration.scope);
const cachePrefix = 'wc2-offline-shell:' + encodeURIComponent(scope.href) + ':';
const cacheName = cachePrefix + VERSION;
const readyURL = new URL('__wc2_offline_ready__', scope).href;
const pinsURL = new URL('__wc2_offline_clients__', scope).href;
const entryURL = new URL('index.html', scope);
const dataPath = new URL('compact-data/', scope).pathname;
const releasePath = new URL('release.json', scope).pathname;
const workerPath = new URL('service-worker.js', scope).pathname;
const maxParallel = 4;
const maxAttempts = 3;
const downloadTimeout = 90_000;
const matchOptions = {ignoreVary: true};

function inScope(url) {
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
}

const validVersion = value => typeof value === 'string' && /^(?!__)[a-zA-Z0-9_.-]{1,128}$/.test(value);

function readManifest() {
  if (!validVersion(VERSION)) {
    throw new Error('Missing offline shell version');
  }
  const manifest = new Map();
  for (const asset of PRECACHE) {
    const path = asset?.path;
    if (typeof path !== 'string' || !/^[a-zA-Z0-9_.\/-]+$/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..') ||
        !Number.isSafeInteger(asset.bytes) || asset.bytes < 0 ||
        typeof asset.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      throw new Error('Invalid offline shell manifest entry');
    }
    if (/^(?:media\/|warcraft2-file\/|warcraft2-files\.json$)/i.test(path) ||
        /\.(?:exe|mpq|zip|pud|smk|msi|iso)$/i.test(path)) {
      throw new Error('Game data does not belong in the offline shell: ' + path);
    }
    const url = new URL(path, scope);
    if (!inScope(url) || url.href === readyURL || url.href === pinsURL || manifest.has(url.pathname)) {
      throw new Error('Invalid or duplicate offline shell URL: ' + path);
    }
    manifest.set(url.pathname, {...asset, url: url.href});
  }
  if (!manifest.has(entryURL.pathname) || !manifest.has(new URL('game.html', scope).pathname)) {
    throw new Error('Offline shell is missing a launch page');
  }
  return manifest;
}

const assets = readManifest();

async function readyMarker(cache) {
  const response = await cache.match(readyURL, matchOptions);
  return response ? response.json() : null;
}

async function complete(cache, expectedVersion, expectedFiles) {
  try {
    const ready = await readyMarker(cache);
    return ready?.version === expectedVersion && Number.isSafeInteger(ready.files) &&
      ready.files > 0 && (expectedFiles === undefined || ready.files === expectedFiles);
  } catch {
    return false;
  }
}

async function clientsInScope() {
  const clients = await self.clients.matchAll({type: 'all', includeUncontrolled: true});
  return clients.filter(client => inScope(new URL(client.url)));
}

function launcherClient(client) {
  if (!client || client.type !== 'window') return false;
  const url = new URL(client.url);
  return inScope(url) && (url.pathname === scope.pathname || url.pathname === entryURL.pathname);
}

async function readPins(version, cache = null) {
  cache ||= await caches.open(cachePrefix + version);
  const response = await cache.match(pinsURL, matchOptions);
  if (!response) return {previousVersion: null, clients: Object.create(null), legacyLaunchers: []};
  const state = await response.json();
  if (state.version !== version || !validVersion(state.previousVersion) ||
      !state.clients || typeof state.clients !== 'object' || Array.isArray(state.clients) ||
      Object.values(state.clients).some(value => !validVersion(value)) ||
      !Array.isArray(state.legacyLaunchers) || state.legacyLaunchers.some(id => typeof id !== 'string')) {
    throw new Error('Invalid offline client versions');
  }
  return {...state, clients: Object.assign(Object.create(null), state.clients)};
}

let pinsPromise;
let pinWrites = Promise.resolve();
let applying;
const getPins = () => pinsPromise ||= readPins(VERSION);
const clientVersion = (pins, id) => pins.clients[id] || pins.previousVersion || VERSION;

function writePins(state) {
  // New navigations can start while earlier versions are still in use.
  const body = JSON.stringify({...state, version: VERSION});
  const write = pinWrites.then(async () => {
    const cache = await caches.open(cacheName);
    await cache.put(pinsURL, new Response(body, {headers: {'Content-Type': 'application/json'}}));
  });
  pinWrites = write.catch(() => {});
  return write;
}

async function prepareActivation(previousVersion, clients, legacyLaunchers = []) {
  if (!validVersion(previousVersion) || previousVersion === VERSION) return false;
  const priorCache = await caches.open(cachePrefix + previousVersion);
  if (!await complete(priorCache, previousVersion)) return false;
  const prior = await readPins(previousVersion, priorCache);
  const versions = Object.create(null);
  for (const client of clients) versions[client.id] = prior.clients[client.id] || previousVersion;
  for (const version of new Set([...Object.values(versions), ...Object.values(prior.clients)])) {
    if (version === previousVersion) continue;
    if (!await complete(await caches.open(cachePrefix + version), version)) return false;
  }
  const state = {previousVersion, clients: versions, legacyLaunchers};
  await writePins(state);
  pinsPromise = Promise.resolve(state);
  await self.skipWaiting();
  return true;
}

async function migrateLegacyLaunchers() {
  if (!self.registration.active) return;
  const prior = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(cachePrefix) || name === cacheName) continue;
    const version = name.slice(cachePrefix.length);
    if (!validVersion(version)) continue;
    const marker = await readyMarker(await caches.open(name));
    if (marker?.version === version && Number.isSafeInteger(marker.files) && marker.files > 0) prior.push(marker);
  }
  // The old shell has no update messages. Promote it automatically only when
  // its identity is unambiguous and every existing client is a launcher.
  if (prior.length !== 1 || prior[0].pinning) return;
  const clients = await clientsInScope();
  if (clients.length && clients.every(launcherClient)) {
    await prepareActivation(prior[0].version, clients, clients.map(client => client.id));
  }
}

async function previousCompleteCaches() {
  const previous = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(cachePrefix) || name === cacheName) continue;
    const cache = await caches.open(name);
    if (await complete(cache, name.slice(cachePrefix.length))) previous.push(cache);
  }
  return previous;
}

async function verifiedResponse(response, asset) {
  if (!response || response.status !== 200 || response.type === 'opaque') {
    throw new Error('Invalid HTTP response for ' + asset.path);
  }
  const body = await response.arrayBuffer();
  if (body.byteLength !== asset.bytes) throw new Error('Incorrect size for ' + asset.path);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
  const sha256 = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('');
  if (sha256 !== asset.sha256) throw new Error('Incorrect SHA-256 for ' + asset.path);

  const headers = new Headers(response.headers);
  // fetch() has already decoded the HTTP representation.
  headers.delete('Content-Encoding');
  headers.delete('Content-Range');
  headers.delete('Accept-Ranges');
  headers.set('Content-Length', String(body.byteLength));
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(body, {status: 200, headers});
}

async function reuseResponse(asset, previous) {
  for (const cache of previous) {
    try {
      const response = await cache.match(asset.url, matchOptions);
      if (response) return await verifiedResponse(response, asset);
    } catch {
      // An old cache is only a source for bytes that still match this release.
    }
  }
  return null;
}

async function download(asset, attempts = maxAttempts) {
  let error;
  for (let attempt = 0; attempt < attempts; ++attempt) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), downloadTimeout);
    try {
      const response = await fetch(asset.url, {
        cache: 'reload', credentials: 'same-origin', redirect: 'error', signal: controller.signal,
      });
      return await verifiedResponse(response, asset);
    } catch (failure) {
      error = failure;
    } finally {
      clearTimeout(timer);
    }
  }
  throw error;
}

async function reportProgress(loaded) {
  try {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      if (inScope(new URL(client.url))) {
        client.postMessage({type: 'WC2_OFFLINE_PROGRESS', loaded, total: assets.size});
      }
    }
  } catch {
    // A disappearing client cannot fail a package install.
  }
}

async function install() {
  const cache = await caches.open(cacheName);
  if (await complete(cache, VERSION, assets.size)) return;

  try {
    const files = [...assets.values()];
    const previous = await previousCompleteCaches();
    let next = 0, loaded = 0, failed = false;
    // Serialize progress delivery without holding up independent downloads.
    let progress = reportProgress(0);
    async function work() {
      while (!failed && next < files.length) {
        const asset = files[next++];
        try {
          const response = await reuseResponse(asset, previous) || await download(asset);
          await cache.put(asset.url, response);
          const count = ++loaded;
          progress = progress.then(() => reportProgress(count));
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }
    const results = await Promise.allSettled(Array.from({length: Math.min(files.length, maxParallel)}, work));
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    await cache.put(readyURL, new Response(JSON.stringify({version: VERSION, files: files.length, pinning: true}), {
      headers: {'Content-Type': 'application/json'},
    }));
    await progress;
  } catch (error) {
    // In-flight writers have settled, and the active version has its own cache.
    try { await caches.delete(cacheName); } catch {}
    throw error;
  }
  // A failed attempt to migrate a legacy launcher still leaves a verified
  // candidate for the browser's normal waiting lifecycle.
  try { await migrateLegacyLaunchers(); } catch {}
}

async function activate() {
  if (!await complete(await caches.open(cacheName), VERSION, assets.size)) {
    throw new Error('Offline shell cache is incomplete');
  }
  const pins = await getPins();
  const legacyLaunchers = pins.legacyLaunchers;
  let clients = [];
  if (pins.previousVersion) {
    clients = await clientsInScope();
    const prior = await readPins(pins.previousVersion);
    // A client that appeared while the update was applying still belongs to
    // the previous controller until this activation completes.
    const versions = Object.create(null);
    for (const client of clients) {
      versions[client.id] = pins.clients[client.id] || prior.clients[client.id] || pins.previousVersion;
    }
    pins.clients = versions;
    pins.legacyLaunchers = [];
    await writePins(pins);
  }
  try {
    const names = await caches.keys();
    // CacheStorage lists caches in creation order. A later installing worker
    // may already be writing its candidate while this worker activates.
    const preceding = names.slice(0, Math.max(0, names.indexOf(cacheName)));
    const retainedVersions = new Set([pins.previousVersion, ...Object.values(pins.clients)]);
    await Promise.all(preceding.filter(name => name.startsWith(cachePrefix) &&
      !retainedVersions.has(name.slice(cachePrefix.length)))
      .map(name => caches.delete(name)));
    const dataCacheName = 'wc2-compact-data-v1:' + scope.href;
    if (!pins.previousVersion && names.includes(dataCacheName) &&
        assets.has(new URL('compact-manifest.json', scope).pathname)) {
      const shell = await caches.open(cacheName);
      const response = await shell.match(new URL('compact-manifest.json', scope), matchOptions);
      if (response) {
        const manifest = await response.json();
        const retained = new Set(manifest.files.flatMap(file => file.chunks)
          .map(chunk => new URL('compact-data/' + chunk.sha256 + '.bin', scope).href));
        const dataCache = await caches.open(dataCacheName);
        await Promise.all((await dataCache.keys()).filter(request => !retained.has(request.url))
          .map(request => dataCache.delete(request)));
      }
    }
  } catch {
    // Old caches can be pruned on the next successful activation.
  }
  await self.clients.claim();
  // A legacy launcher cannot react to controllerchange itself. Only its
  // original launcher document is restarted. Navigation fetches can wait for
  // activation, so never await them inside the activate event.
  if (legacyLaunchers.length && clients.every(launcherClient)) {
    const url = new URL('?wc2-update', scope);
    for (const client of clients) {
      if (legacyLaunchers.includes(client.id)) void client.navigate(url.href).catch(() => {});
    }
  }
}

self.addEventListener('install', event => event.waitUntil(install()));
self.addEventListener('activate', event => event.waitUntil(activate()));

self.addEventListener('message', event => {
  const port = event.ports?.[0];
  if (!port) return;
  if (event.data?.type === 'WC2_APPLY_UPDATE') {
    event.waitUntil((async () => {
      const reply = status => port.postMessage({type: 'WC2_UPDATE_RESULT', version: VERSION, status});
      if (event.data.version !== VERSION) return reply('denied');
      const clients = await clientsInScope();
      if (!launcherClient(clients.find(client => client.id === event.source?.id))) return reply('denied');
      if (!await complete(await caches.open(cacheName), VERSION, assets.size)) return reply('incomplete');
      if (self.registration.waiting?.state !== 'installed' || applying) return reply('blocked');
      applying = prepareActivation(event.data.previousVersion, clients);
      try { reply(await applying ? 'applying' : 'incomplete'); }
      catch { reply('incomplete'); }
      finally { applying = null; }
    })());
    return;
  }
  if (event.data?.type !== 'WC2_OFFLINE_STATUS') return;
  event.waitUntil((async () => {
    let ready = false, servedVersion = VERSION;
    try {
      ready = await complete(await caches.open(cacheName), VERSION, assets.size);
      if (ready && event.source?.id) servedVersion = clientVersion(await getPins(), event.source.id);
    } catch { ready = false; }
    port.postMessage({version: VERSION, ready, clientVersion: servedVersion, pinning: true});
  })());
});

async function serveAsset(asset) {
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(asset.url, matchOptions);
    if (response) return response;
    // A missing entry can be repaired only with this worker's exact bytes.
    const verified = await download(asset, 1);
    try { await cache.put(asset.url, verified.clone()); } catch {}
    return verified;
  } catch {
    return unavailable();
  }
}

function unavailable(status = 503) {
  return new Response('Файл этой версии игры недоступен. При подключении к сети перезагрузите страницу.', {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  });
}

async function serveRequest(event, asset, url) {
  try {
    const pins = await getPins();
    const navigation = event.request.mode === 'navigate';
    const version = !navigation && event.clientId ? clientVersion(pins, event.clientId) : VERSION;
    if (pins.previousVersion && event.resultingClientId && asset) {
      // Navigation opens the latest package. A newly spawned worker inherits
      // the package of its requesting document for any later subrequests.
      pins.clients[event.resultingClientId] = version;
      await writePins(pins);
    }
    if (version === VERSION) {
      if (asset) return serveAsset(asset);
      // The guest probes optional bundled fonts and other resources that are
      // absent from the package. Keep a normal HTTP miss when offline.
      return await fetch(event.request).catch(() => unavailable(404));
    }
    const cache = await caches.open(cachePrefix + version);
    const oldResponse = await cache.match(url, matchOptions);
    // A running game must never load a new version of a lazy shell asset.
    return oldResponse || unavailable(asset ? 503 : 404);
  } catch {
    return unavailable();
  }
}

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !inScope(url)) return;
  if (url.pathname.startsWith(dataPath) || url.pathname === releasePath || url.pathname === workerPath) return;
  const path = url.pathname === scope.pathname ? entryURL.pathname : url.pathname;
  const asset = assets.get(path);
  if (asset || request.mode !== 'navigate' && event.clientId) {
    event.respondWith(serveRequest(event, asset, new URL(path, scope).href));
  }
});
