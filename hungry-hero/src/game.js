/*
 * Hungry Hero — Cocos Creator 3.8 (web) port.
 * Faithful gameplay port of the original AS3/Starling version by Hemanth Sharma.
 * Built at runtime from the original TexturePacker atlas + audio (no editor asset bundle needed).
 */
System.register(['cc'], function (_export, _context) {
  'use strict';

  var cc;
  return {
    setters: [function (_cc) { cc = _cc; }],
    execute: function () {

      /* ---------- engine aliases ---------- */
      var D = cc._decorator;
      var ccclass = D.ccclass;
      var Node = cc.Node, Sprite = cc.Sprite, SpriteFrame = cc.SpriteFrame, Texture2D = cc.Texture2D,
          Label = cc.Label, Camera = cc.Camera, Scene = cc.Scene, Component = cc.Component,
          ParticleSystem2D = cc.ParticleSystem2D, Color = cc.Color, Vec2 = cc.Vec2, Vec3 = cc.Vec3,
          Rect = cc.Rect, Size = cc.Size, UITransform = cc.UITransform, EventType = cc.Node.EventType,
          Canvas = cc.Canvas, Graphics = cc.Graphics;

      /* ---------- constants (mirrors GameConstants.as) ---------- */
      var DESIGN_W = 1024, DESIGN_H = 768;
      var HERO_LIVES = 5, HERO_MIN_SPEED = 650, HERO_MAX_SPEED = 1400, OBSTACLE_GAP = 1200, OBSTACLE_SPEED = 300;
      var GAME_STATE_IDLE = 0, GAME_STATE_FLYING = 1, GAME_STATE_OVER = 2;
      var ITEM_COFFEE = 6, ITEM_MUSHROOM = 7;
      var OBSTACLE_GAP_TIME = OBSTACLE_GAP;

      var SP = window.__HH_SPRITES__ || {};

      /* ---------- helpers ---------- */
      function WY(sy) { return DESIGN_H - sy; }                 // y-down(design) -> y-up(world)
      function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
      function rand(a, b) { return a + Math.random() * (b - a); }
      function randi(a, b) { return Math.ceil(rand(a, b)); }
      function loadImage(url) {
        return new Promise(function (res, rej) {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function () { res(img); };
          img.onerror = function () { rej(new Error('failed to load ' + url)); };
          img.src = url;
        });
      }

      var SHEET, TEX_WELCOME, TEX_SKY, TEX_PARTICLE;
      var FR = {}, heroFrames = [], obstacle4Frames = [], watchOutFrames = [];

      // Wrap a runtime-loaded HTMLImageElement in a cc.ImageAsset before assigning it
      // to a Texture2D. This engine's Texture2D.image setter calls mipmaps[0].extractMipmaps(),
      // which only exists on ImageAsset (a raw HTMLImageElement throws "extractMipmaps is not a function").
      // Wrap a runtime-loaded HTMLImageElement in a cc.ImageAsset before assigning it
      // to a Texture2D. This engine's Texture2D.image setter calls mipmaps[0].extractMipmaps(),
      // which only exists on ImageAsset (a raw HTMLImageElement throws "extractMipmaps is not a function").
      // NOTE: cc.ImageAsset.data is a read-only getter in this build, so we set the backing
      // field _nativeData directly (what the data getter returns for an HTMLImageElement).
      function makeTex(img) {
        var imageAsset = new cc.ImageAsset();
        imageAsset._format = 35;        // RGBA8888 (matches cocos-js PixelFormat enum)
        imageAsset._nativeData = img;   // backing field; data getter returns it for HTMLElement
        var t = new Texture2D();
        t.image = imageAsset;
        t.packable = false;
        return t;
      }
      function sheetFrame(tex, name) {
        var s = SP[name]; if (!s) return null;
        var f = new SpriteFrame();
        f.texture = tex;
        f.rect = new Rect(s.x, s.y, s.w, s.h);
        f.originalSize = new Size(s.ow, s.oh);
        // Cocos `offset` = displacement of the trimmed content from the centre of the
        // original frame (x right-positive, y up-positive). TexturePacker stores
        // frameX/frameY as negative paddings measured from the top-left, so:
        //   offset.x = trimLeft - (ow - w) / 2       where trimLeft = -frameX
        //   offset.y = (oh - h) / 2 - trimTop        where trimTop  = -frameY
        f.offset = new Vec2(-s.ox - (s.ow - s.w) / 2, (s.oh - s.h) / 2 + s.oy);
        return f;
      }
      function fullFrame(tex) {
        var f = new SpriteFrame();
        f.texture = tex;
        f.rect = new Rect(0, 0, tex.width, tex.height);
        f.originalSize = new Size(tex.width, tex.height);
        f.offset = new Vec2(0, 0);
        return f;
      }
      function customSize(n, w, h) {
        n.getComponent(UITransform).setContentSize(w, h);
      }
      function mkSprite(name, parent) {
        var n = new Node(name);
        var sp = n.addComponent(Sprite);
        sp.spriteFrame = FR[name];
        sp.sizeMode = (Sprite.SizeMode && Sprite.SizeMode.CUSTOM != null) ? Sprite.SizeMode.CUSTOM : 0;
        var s = SP[name]; customSize(n, s.ow, s.oh);
        if (parent) n.parent = parent;
        return n;
      }
      function mkFull(name, tex, w, h, parent) {
        var n = new Node(name);
        var sp = n.addComponent(Sprite);
        sp.spriteFrame = fullFrame(tex);
        sp.sizeMode = (Sprite.SizeMode && Sprite.SizeMode.CUSTOM != null) ? Sprite.SizeMode.CUSTOM : 0;
        customSize(n, w, h);
        // Full-screen art is anchored at the centre in the 0..DESIGN_W / 0..DESIGN_H design
        // space (the AS3 original used a top-left registration point).
        n.setPosition(DESIGN_W / 2, DESIGN_H / 2, 0);
        if (parent) n.parent = parent;
        return n;
      }
      function mkLabel(str, size, color, w, h, parent) {
        var n = new Node('lbl');
        var lb = n.addComponent(Label);
        lb.string = str;
        lb.fontSize = size;
        lb.lineHeight = size * 1.25;
        lb.color = color || Color.WHITE;
        lb.horizontalAlign = 1;  // CENTER
        lb.verticalAlign = 0;    // TOP
        lb.overflow = 0;         // NONE
        customSize(n, w, h);
        if (parent) n.parent = parent;
        return n;
      }
      function placeCenter(n, sx, sy) { n.setPosition(sx, WY(sy), 0); }
      function placeTL(n, sx, sy, w, h) { n.setPosition(sx + w / 2, WY(sy + h / 2), 0); }
      function btn(name, parent, cb) {
        var n = mkSprite(name, parent);
        n.on(EventType.TOUCH_END, cb, this);
        return n;
      }

      /* =========================================================
       *  GAME
       * ========================================================= */
      // NOTE: defined as a plain subclass of Component (no ccclass wrapper). ccclass in this
      // runtime build returns a class whose prototype chain to Component is broken, which makes
      // Node.addComponent() fail with engine error 3810 (not a subclass of Component). For a
      // runtime-built component we don't need ccclass (that's only for editor serialization).
      var Game = class HHGame extends Component {
        constructor() { super(); this.state = 'welcome'; }

        init(engine, a) {
          this.assets = a;
          this.muted = false;
          this.touchX = DESIGN_W * 0.5;
          this.touchY = DESIGN_H * 0.5;
          this.canvas = engine.game.canvas;

          this.bgWelcomeNode = mkFull('bgWelcome', a.TEX_BG_WELCOME, DESIGN_W, DESIGN_H, this.node);

          this.playNode = new Node('PlayLayer'); this.playNode.parent = this.node; this.playNode.active = false;
          this.uiNode = new Node('UILayer'); this.uiNode.parent = this.node; this.uiNode.active = false;
          this.overlayNode = new Node('Overlay'); this.overlayNode.parent = this.node; this.overlayNode.active = false;
          this.welcomeNode = new Node('Welcome'); this.welcomeNode.parent = this.node; this.welcomeNode.active = false;
          this.aboutNode = new Node('About'); this.aboutNode.parent = this.node; this.aboutNode.active = false;

          this.buildBackground();
          this.buildWelcome();
          this.buildAbout();
          this.buildHUD();
          this.buildGameOver();

          this.setupInput();
          this.buildViewportFrame();
          this.showWelcome();
        }

        /* ---------- viewport frame ----------
         * The design box (1024x768) is letterboxed into whatever area the canvas has, so the
         * tiling parallax layers can spill into the margins. These two dark bars keep the
         * game inside a clean fixed viewport, matching the original 1024x768 stage.
         */
        buildViewportFrame() {
          var n = new Node('ViewportFrame');
          n.parent = this.node;
          var g = n.addComponent(Graphics);
          g.fillColor = new Color(10, 13, 20, 255);
          g.rect(-4096, -400, 4096, DESIGN_H + 800); g.fill();
          g.rect(DESIGN_W, -400, 4096, DESIGN_H + 800); g.fill();
          this.frameNode = n;
        }

        /* ---------- input ---------- */
        setupInput() {
          var self = this;
          var move = function (e) {
            var r = self.canvas.getBoundingClientRect();
            self.touchX = clamp((e.clientX - r.left) / r.width * DESIGN_W, 0, DESIGN_W);
            self.touchY = clamp((e.clientY - r.top) / r.height * DESIGN_H, 0, DESIGN_H);
          };
          this.canvas.addEventListener('pointermove', move);
          this.canvas.addEventListener('pointerdown', function (e) { move(e); self.onFirstGesture(); });
          this.canvas.addEventListener('touchmove', function (e) {
            if (e.touches && e.touches[0]) move(e.touches[0]);
          }, { passive: true });
        }
        onFirstGesture() {
          if (this._gesture) return; this._gesture = true;
          if (this.state === 'welcome' && !this.muted) this.startMusic('assets/audio/bgWelcome.mp3');
        }

        /* ---------- audio ---------- */
        startMusic(url) {
          this.stopMusic();
          try {
            this.bgAudio = new Audio(url); this.bgAudio.loop = true; this.bgAudio.volume = 0.35;
            if (!this.muted) { var p = this.bgAudio.play(); if (p && p.catch) p.catch(function () {}); }
          } catch (e) {}
        }
        stopMusic() { if (this.bgAudio) { try { this.bgAudio.pause(); } catch (e) {} this.bgAudio = null; } }
        sfx(name) {
          if (this.muted) return;
          try { var a = new Audio('assets/audio/' + name + '.mp3'); a.volume = 0.6; var p = a.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
        }

        /* ---------- background (parallax) ----------
         * Mirrors GameBackground.as / BgLayer.as: four layers, each made of two copies of a
         * 1024-wide bottom-aligned strip. Both copies keep their LEFT edge on a multiple of
         * the strip width (0 and w), so the tile seam starts at the right edge of the stage
         * exactly like the original — the whole layer then slides left and wraps at -w.
         */
        makeLayer(name, depth, tex, w, h) {
          var layer = new Node('layer_' + name);
          layer.parent = this.playNode;
          var a, b;
          if (tex) {
            a = mkFull(name + '_a', tex, w, h, layer);
            b = mkFull(name + '_b', tex, w, h, layer);
          } else {
            a = mkSprite(name, layer); customSize(a, w, h);
            b = mkSprite(name, layer); customSize(b, w, h);
          }
          var y = WY(DESIGN_H - h / 2);          // bottom-aligned strip
          a.setPosition(w / 2, y, 0);            // left edge at 0
          b.setPosition(w * 1.5, y, 0);          // left edge at w
          return { node: layer, a: a, b: b, w: w, h: h, y: y, depth: depth, off: 0 };
        }
        buildBackground() {
          this.bgLayers = [
            // bgLayer1 lives outside the atlas (full 1024x768 sky/ground strip).
            this.makeLayer('bgSky', 0.02, this.assets.TEX_BG_SKY, DESIGN_W, DESIGN_H),
            this.makeLayer('bgLayer2', 0.2, null, SP.bgLayer2.ow, SP.bgLayer2.oh),
            this.makeLayer('bgLayer3', 0.5, null, SP.bgLayer3.ow, SP.bgLayer3.oh),
            this.makeLayer('bgLayer4', 1.0, null, SP.bgLayer4.ow, SP.bgLayer4.oh)
          ];
        }
        scrollBg(speed) {
          for (var i = 0; i < this.bgLayers.length; i++) {
            var L = this.bgLayers[i];
            L.off -= speed * L.depth / 60;
            if (L.off <= -L.w) L.off += L.w;
            L.a.setPosition(L.off + L.w / 2, L.y, 0);
            L.b.setPosition(L.off + L.w * 1.5, L.y, 0);
          }
        }

        /* ---------- welcome ---------- */
        buildWelcome() {
          var w = this.welcomeNode;
          this.wTitle = mkSprite('welcome_title', w);
          this.wHero = mkSprite('welcome_hero', w);
          this.wPlay = btn('welcome_playButton', w, this.onPlayClick.bind(this));
          this.wAbout = btn('welcome_aboutButton', w, this.onAboutClick.bind(this));
          placeTL(this.wTitle, 600, 65, SP.welcome_title.ow, SP.welcome_title.oh);
          this.wHero.setPosition(-SP.welcome_hero.ow, WY(230), 0);
          this.wHero.active = true;
          placeTL(this.wPlay, 640, 340, SP.welcome_playButton.ow, SP.welcome_playButton.oh);
          placeTL(this.wAbout, 460, 460, SP.welcome_aboutButton.ow, SP.welcome_aboutButton.oh);
        }
        showWelcome() {
          this.state = 'welcome';
          this.welcomeStart = Date.now();
          this.stopMusic();
          this.welcomeNode.active = true; this.aboutNode.active = false;
          this.playNode.active = false; this.uiNode.active = false; this.overlayNode.active = false;
          this.bgWelcomeNode.active = true;
          this.wHero.setPosition(-SP.welcome_hero.ow, WY(230), 0);
        }
        onPlayClick() { this.sfx('coffee'); this.startGame(); }
        onAboutClick() { this.sfx('mushroom'); this.showAbout(); }
        showAbout() {
          this.aboutNode.active = true;
          this.welcomeNode.active = false;
        }

        /* ---------- about ---------- */
        buildAbout() {
          var a = this.aboutNode;
          var bg = mkFull('aboutBG', this.assets.TEX_BG_WELCOME, DESIGN_W, DESIGN_H, a);
          bg.opacity = 230;
          var txt = mkLabel(
            'Hungry Hero\n\n' +
            'The hero is always hungry — feed him with food and score points.\n' +
            'Avoid the obstacles (a "Look out!" warning appears before they hit).\n' +
            'You have 5 lives. Travel as far as you can.\n\n' +
            'Coffee = speed boost & smash through obstacles.\n' +
            'Mushroom = food flies toward you.\n\n' +
            'Originally built with Adobe Flash + Starling by Hemanth Sharma.\n' +
            'Re-made with Cocos Creator 3.8 by 耿鹏.',
            26, Color.WHITE, 760, 420, a);
          placeTL(txt, 130, 150, 760, 420);
          this.aBack = btn('about_backButton', a, function () { this.sfx('coffee'); this.showWelcome(); }.bind(this));
          placeTL(this.aBack, 660, 600, SP.about_backButton.ow, SP.about_backButton.oh);
        }

        /* ---------- HUD ---------- */
        buildHUD() {
          var u = this.uiNode;
          this.hudLives = mkLabel('LIVES', 22, Color.WHITE, 150, 30, u); placeTL(this.hudLives, 20, 16, 150, 30);
          this.hudLivesVal = mkLabel('5', 34, Color.WHITE, 150, 44, u); placeTL(this.hudLivesVal, 20, 46, 150, 44);
          this.hudScore = mkLabel('SCORE', 22, Color.WHITE, 160, 30, u); placeTL(this.hudScore, DESIGN_W / 2 - 80, 16, 160, 30);
          this.hudScoreVal = mkLabel('0', 34, Color.WHITE, 160, 44, u); placeTL(this.hudScoreVal, DESIGN_W / 2 - 80, 46, 160, 44);
          this.hudDist = mkLabel('DISTANCE', 22, Color.WHITE, 160, 30, u); placeTL(this.hudDist, DESIGN_W - 180, 16, 160, 30);
          this.hudDistVal = mkLabel('0', 34, Color.WHITE, 160, 44, u); placeTL(this.hudDistVal, DESIGN_W - 180, 46, 160, 44);
          this.pauseBtn = btn('pauseButton', u, this.onPauseClick.bind(this)); placeTL(this.pauseBtn, 30, DESIGN_H - 70, SP.pauseButton.ow, SP.pauseButton.oh);
          this.soundBtn = btn('soundOn0000', u, this.onSoundClick.bind(this)); placeTL(this.soundBtn, 80, DESIGN_H - 70, 40, 40);
        }
        onPauseClick() {
          this.gamePaused = !this.gamePaused;
          this.sfx('coffee');
          if (this.bgAudio) { if (this.gamePaused) this.bgAudio.pause(); else if (!this.muted) this.bgAudio.play(); }
        }
        onSoundClick() {
          this.muted = !this.muted;
          this.soundBtn.getComponent(Sprite).spriteFrame = this.muted ? FR.soundOff : FR.soundOn0000;
          if (this.muted) { if (this.bgAudio) this.bgAudio.pause(); } else { if (this.bgAudio && !this.gamePaused) this.bgAudio.play(); this.sfx('coffee'); }
        }
        setHud() {
          this.hudLivesVal.getComponent(Label).string = '' + this.lives;
          this.hudScoreVal.getComponent(Label).string = '' + this.scoreItems;
          this.hudDistVal.getComponent(Label).string = '' + Math.round(this.scoreDistance);
        }

        /* ---------- game over ---------- */
        buildGameOver() {
          var o = this.overlayNode;
          this.goBg = mkFull('goBG', this.assets.TEX_BG_WELCOME, DESIGN_W, DESIGN_H, o); this.goBg.opacity = 200;
          // Same vertical rhythm as GameOverContainer.as: message at 20% height, scores at 40%.
          this.goMsg = mkLabel('HERO WAS KILLED!', 56, new Color(243, 231, 95), 900, 80, o);
          placeTL(this.goMsg, (DESIGN_W - 900) / 2, DESIGN_H * 0.20, 900, 80);
          this.goDist = mkLabel('DISTANCE TRAVELLED: 0', 34, Color.WHITE, 900, 50, o);
          placeTL(this.goDist, (DESIGN_W - 900) / 2, DESIGN_H * 0.40, 900, 50);
          this.goScore = mkLabel('SCORE: 0', 34, Color.WHITE, 900, 50, o);
          placeTL(this.goScore, (DESIGN_W - 900) / 2, DESIGN_H * 0.40 + 50, 900, 50);

          this.goMain = btn('gameOver_mainButton', o, function () { this.sfx('mushroom'); this.showWelcome(); }.bind(this));
          this.goAgain = btn('gameOver_playAgainButton', o, this.onPlayAgain.bind(this));
          this.goAbout = btn('gameOver_aboutButton', o, this.onAboutClick.bind(this));

          // Buttons are laid out edge to edge with 10px gaps and centred as a group (same as
          // GameOverContainer.as), rather than at hard-coded offsets.
          var GAP = 10;
          var wM = SP.gameOver_mainButton.ow, hM = SP.gameOver_mainButton.oh;
          var wA = SP.gameOver_playAgainButton.ow, hA = SP.gameOver_playAgainButton.oh;
          var wB = SP.gameOver_aboutButton.ow, hB = SP.gameOver_aboutButton.oh;
          var yTop = DESIGN_H * 0.70;
          var x = DESIGN_W * 0.5 - (wM + wA + wB + GAP * 2) * 0.5;
          placeTL(this.goMain, x, yTop, wM, hM);
          x += wM + GAP;
          placeTL(this.goAgain, x, yTop + (hM - hA) / 2, wA, hA);
          x += wA + GAP;
          placeTL(this.goAbout, x, yTop + (hM - hB) / 2, wB, hB);
        }
        onPlayAgain() { this.sfx('mushroom'); this.startGame(); }

        /* ---------- start / reset game ---------- */
        startGame() {
          this.overlayNode.active = false; this.welcomeNode.active = false; this.aboutNode.active = false;
          this.playNode.active = true; this.uiNode.active = true;
          this.bgWelcomeNode.active = false;

          this.gameState = GAME_STATE_IDLE;
          this.lives = HERO_LIVES;
          this.scoreItems = 0; this.scoreDistance = 0;
          this.playerSpeed = 0; this.gamePaused = false; this.shakeX = 0;
          this.coffee = 0; this.mushroom = 0;
          this.hitObstacle = 0; this.cameraShake = 0;

          if (!this.heroNode) {
            this.heroNode = mkSprite('fly_0001', this.playNode);
            this.heroAnimTime = 0;
          }
          this.heroNode.active = true;
          this.heroNode.setScale(1, 1, 1);
          this.heroNode.setRotationFromEuler(0, 0, 0);
          this.heroState = 0;
          this.heroX = -DESIGN_W; this.heroY = DESIGN_H / 2;
          placeCenter(this.heroNode, this.heroX, this.heroY);

          // reset pools
          this.items = []; this.obstacles = []; this.eatParts = []; this.windParts = [];
          this.pattern = 1; this.patternPosY = 100; this.patternStep = 15; this.patternDir = 1;
          this.patternGap = 20; this.patternGapCount = 0; this.patternChange = 100;
          this.patternLen = 50; this.patternOnce = true;
          this.obstacleGapCount = 0;
          this.gameArea = { top: 100, bottom: DESIGN_H - 250 };

          // particles
          this.makeEmitters();
          this.state = 'play';
          this.startMusic('assets/audio/bgGame.mp3');
          this.setHud();
        }

        makeEmitters() {
          if (this.coffeePS) return;
          try {
            this.coffeePS = new Node('coffeePS'); this.coffeePS.parent = this.heroNode;
            var cp = this.coffeePS.addComponent(ParticleSystem2D);
            cp.spriteFrame = this.assets.particleFrame;
            cp.duration = -1; cp.emissionRate = 50; cp.life = 0.6; cp.lifeVar = 0.2;
            cp.speed = 70; cp.speedVar = 30; cp.angle = 90; cp.angleVar = 40;
            cp.startSize = 18; cp.startSizeVar = 8; cp.endSize = 4; cp.endSizeVar = 2;
            cp.startColor = new Color(255, 220, 120, 255); cp.startColorVar = new Color(40, 30, 0, 0);
            cp.endColor = new Color(255, 150, 40, 0); cp.endColorVar = new Color(0, 0, 0, 0);
            cp.posVar = new Vec2(18, 18); cp.gravity = new Vec2(0, 260); cp.totalParticles = 90;
            cp.emitting = false;
            this.mushroomPS = new Node('mushroomPS'); this.mushroomPS.parent = this.heroNode;
            var mp = this.mushroomPS.addComponent(ParticleSystem2D);
            mp.spriteFrame = this.assets.particleFrame;
            mp.duration = -1; mp.emissionRate = 40; mp.life = 0.7; mp.lifeVar = 0.2;
            mp.speed = 50; mp.speedVar = 20; mp.angle = 270; mp.angleVar = 50;
            mp.startSize = 16; mp.startSizeVar = 6; mp.endSize = 3; mp.endSizeVar = 2;
            mp.startColor = new Color(120, 230, 120, 255); mp.startColorVar = new Color(20, 40, 20, 0);
            mp.endColor = new Color(40, 160, 40, 0); mp.endColorVar = new Color(0, 0, 0, 0);
            mp.posVar = new Vec2(16, 16); mp.gravity = new Vec2(0, -200); mp.totalParticles = 70;
            mp.emitting = false;
          } catch (e) { console.warn('particles disabled:', e); this.coffeePS = null; }
        }

        /* ---------- pooling helpers ---------- */
        get foodItem() {
          for (var i = 0; i < this.items.length; i++) if (!this.items[i].alive) return this.items[i];
          var it = { node: mkSprite('item1', this.playNode) };
          this.items.push(it); return it;
        }
        get obstacleSlot() {
          for (var i = 0; i < this.obstacles.length; i++) if (!this.obstacles[i].alive) return this.obstacles[i];
          var ob = { node: new Node('ob'), spr: mkSprite('obstacle1', this.playNode) };
          this.obstacles.push(ob); return ob;
        }
        get eatSlot() {
          for (var i = 0; i < this.eatParts.length; i++) if (!this.eatParts[i].alive) return this.eatParts[i];
          var p = { node: mkSprite('particleEat', this.playNode) }; this.eatParts.push(p); return p;
        }
        get windSlot() {
          for (var i = 0; i < this.windParts.length; i++) if (!this.windParts[i].alive) return this.windParts[i];
          var p = { node: mkSprite('particleWindForce', this.playNode) }; this.windParts.push(p); return p;
        }

        /* ---------- ITEM patterns (mirrors InGame.as) ---------- */
        setFoodPattern(elapsed) {
          if (this.patternChange > 0) { this.patternChange -= this.playerSpeed * elapsed; return; }
          if (Math.random() < 0.7) this.pattern = randi(1, 4);
          else this.pattern = randi(1, 2) + 9; // 10 or 11 (coffee / mushroom)
          if (this.pattern === 1) { this.patternStep = 15; this.patternChange = rand(500, 1000); }
          else if (this.pattern === 2) { this.patternOnce = true; this.patternStep = 40; this.patternChange = this.patternGap * rand(0, 3) + 5; }
          else if (this.pattern === 3) { this.patternStep = randi(2, 4) * 10; if (Math.random() > 0.5) this.patternDir *= -1; this.patternChange = rand(800, 1600); }
          else if (this.pattern === 4) { this.patternStep = randi(2, 4) * 50; this.patternChange = rand(400, 800); }
          else this.patternChange = 0;
        }
        spawnFood(elapsed) {
          if (this.patternGapCount < this.patternGap) { this.patternGapCount += this.playerSpeed * elapsed; return; }
          if (this.pattern === 0) return;
          this.patternGapCount = 0;
          this.reuseFood();
        }
        reuseFood() {
          var ga = this.gameArea;
          if (this.pattern === 1) {
            if (Math.random() > 0.9) this.patternPosY = randi(ga.top, ga.bottom);
            var it = this.foodItem; it.type = randi(1, 5); this.configureFood(it);
          } else if (this.pattern === 2) {
            if (this.patternOnce) { this.patternOnce = false; this.patternPosY = randi(ga.top, ga.bottom); this.patternLen = rand(0.4, 0.8) * DESIGN_H; }
            var ps = this.patternPosY; var end = this.patternPosY + this.patternLen;
            while (ps + this.patternStep < end && ps < DESIGN_H * 0.8) { var it2 = this.foodItem; it2.type = randi(1, 5); this.configureFoodAt(it2, ps); ps += this.patternStep; }
          } else if (this.pattern === 3) {
            if (this.patternDir === 1 && this.patternPosY > ga.bottom - 50) this.patternDir = -1;
            else if (this.patternDir === -1 && this.patternPosY < ga.top) this.patternDir = 1;
            if (this.patternPosY >= ga.top && this.patternPosY <= ga.bottom) { var it3 = this.foodItem; it3.type = randi(1, 5); this.configureFoodAt(it3, this.patternPosY); }
            this.patternPosY += this.patternStep * this.patternDir;
          } else if (this.pattern === 4) {
            if (Math.random() > 0.3) { this.patternPosY = randi(ga.top, ga.bottom); while (this.patternPosY + this.patternStep < ga.bottom) { var it4 = this.foodItem; it4.type = randi(1, 5); this.configureFoodAt(it4, this.patternPosY); this.patternPosY += randi(100, 200); } }
          } else if (this.pattern === 10 || this.pattern === 11) {
            this.patternPosY = randi(ga.top, ga.bottom);
            var it5 = this.foodItem; it5.type = randi(1, 2) + 5; this.configureFood(it5);
          }
        }
        configureFood(it) { this.configureFoodAt(it, this.patternPosY); }
        configureFoodAt(it, y) {
          it.alive = true; it.type = it.type;
          var f = FR['item' + it.type]; if (f) it.node.getComponent(Sprite).spriteFrame = f;
          it.node.active = true;
          it.x = DESIGN_W + 80; it.y = y; placeCenter(it.node, it.x, it.y);
        }
        animateFood(dt, elapsed) {
          var ga = this.gameArea, hx = this.heroX, hy = this.heroY;
          for (var i = 0; i < this.items.length; i++) {
            var it = this.items[i]; if (!it.alive) continue;
            if (this.mushroom > 0 && it.type <= 5) {
              it.x -= (it.x - hx) * 0.2; it.y -= (it.y - hy) * 0.2;
            } else { it.x -= this.playerSpeed * elapsed; }
            placeCenter(it.node, it.x, it.y);
            if (it.x < -80 || this.gameState === GAME_STATE_OVER) { it.alive = false; it.node.active = false; continue; }
            var dx = it.x - hx, dy = it.y - hy, sq = dx * dx + dy * dy;
            if (sq < 5000) {
              if (it.type <= 5) { this.scoreItems += it.type; this.sfx('eat'); }
              else if (it.type === ITEM_COFFEE) { this.scoreItems += 1; this.coffee = 5; if (this.coffeePS) this.coffeePS.getComponent(ParticleSystem2D).emitting = true; this.sfx('coffee'); }
              else if (it.type === ITEM_MUSHROOM) { this.scoreItems += 1; this.mushroom = 4; if (this.mushroomPS) this.mushroomPS.getComponent(ParticleSystem2D).emitting = true; this.sfx('mushroom'); }
              this.spawnEat(it.x, it.y); it.alive = false; it.node.active = false;
            }
          }
        }
        spawnEat(x, y) {
          for (var c = 0; c < 3; c++) {
            var p = this.eatSlot; p.alive = true; p.node.active = true;
            p.x = x + rand(-20, 20); p.y = y - rand(0, 40);
            p.sx = rand(1, 3); p.sy = rand(-5, 5); p.spin = rand(-5, 5); p.scale = rand(0.3, 0.6);
            p.node.setScale(p.scale, p.scale, p.scale); p.node.setRotationFromEuler(0, 0, 0);
            placeCenter(p.node, p.x, p.y);
          }
        }
        animateEat(elapsed) {
          for (var i = 0; i < this.eatParts.length; i++) {
            var p = this.eatParts[i]; if (!p.alive) continue;
            p.sx -= 1; p.sy -= p.sy * 0.2; p.scale -= 0.03;
            p.x += p.sx; p.y -= p.sy;
            p.node.setRotationFromEuler(0, 0, p.node.eulerAngles.z + p.spin);
            p.node.setScale(p.scale, p.scale, p.scale); placeCenter(p.node, p.x, p.y);
            if (p.scale <= 0.02) { p.alive = false; p.node.active = false; }
          }
        }
        spawnWind() {
          var w = this.windSlot; w.alive = true; w.node.active = true;
          w.x = DESIGN_W; w.y = rand(0, DESIGN_H); w.scale = rand(0.5, 1.0);
          w.node.setScale(w.scale, w.scale, w.scale); placeCenter(w.node, w.x, w.y);
        }
        animateWind(elapsed) {
          for (var i = 0; i < this.windParts.length; i++) {
            var w = this.windParts[i]; if (!w.alive) continue;
            w.x -= 100 * w.scale; w.node.x -= 100 * w.scale; placeCenter(w.node, w.x, w.y);
            if (w.x < -300 || this.gameState === GAME_STATE_OVER) { w.alive = false; w.node.active = false; }
          }
        }

        /* ---------- obstacles ---------- */
        spawnObstacle(elapsed) {
          if (this.obstacleGapCount < OBSTACLE_GAP) { this.obstacleGapCount += this.playerSpeed * elapsed; return; }
          this.obstacleGapCount = 0;
          var type = randi(1, 4), dist = rand(1000, 2000);
          var ob = this.obstacleSlot; ob.alive = true; ob.type = type; ob.alreadyHit = false; ob.lookOut = true;
          ob.distance = dist; ob.node.active = true; ob.node.setRotationFromEuler(0, 0, 0);
          var fname = (type === 4) ? 'obstacle4_0001' : ('obstacle' + type);
          ob.fname = fname; ob.ow = SP[fname].ow;
          var s = ob.spr; s.getComponent(Sprite).spriteFrame = FR[fname];
          if (type <= 3) {
            if (Math.random() > 0.5) { ob.pos = 'top'; ob.y = this.gameArea.top; } else { ob.pos = 'bottom'; ob.y = this.gameArea.bottom - SP[fname].oh; }
          } else { ob.pos = 'middle'; ob.y = randi(this.gameArea.top, this.gameArea.bottom - SP.obstacle4_0001.oh); }
          ob.node.x = DESIGN_W;
          ob.x = DESIGN_W; ob.y = ob.y; placeCenter(ob.node, ob.x, ob.y);
          ob.watch = mkSprite('watchOut_0001', ob.node); ob.watch.active = true;
        }
        animateObstacles(dt, elapsed) {
          var hx = this.heroX, hy = this.heroY;
          for (var i = 0; i < this.obstacles.length; i++) {
            var ob = this.obstacles[i]; if (!ob.alive) continue;
            if (ob.distance > 0) { ob.distance -= this.playerSpeed * elapsed; }
            else {
              if (ob.lookOut) { ob.lookOut = false; if (ob.watch) ob.watch.active = false; }
              ob.x -= (this.playerSpeed + OBSTACLE_SPEED) * elapsed;
              ob.node.x = ob.x;
            }
            placeCenter(ob.node, ob.x, ob.y);
            if (ob.x < -ob.ow || this.gameState === GAME_STATE_OVER) { ob.alive = false; ob.node.active = false; if (ob.watch) { ob.watch.active = false; } continue; }
            var dx = ob.x - hx, dy = ob.y - hy, sq = dx * dx + dy * dy;
            if (sq < 5000 && !ob.alreadyHit) {
              ob.alreadyHit = true; this.sfx('hit'); this.cameraShake = 12;
              if (this.coffee > 0) {
                ob.node.setRotationFromEuler(0, 0, ob.pos === 'bottom' ? 100 : -100);
                this.hitObstacle = 30; this.playerSpeed *= 0.8;
                if (ob.spr) ob.spr.getComponent(Sprite).spriteFrame = FR['obstacle' + ob.type + '_crash'];
              } else {
                ob.node.setRotationFromEuler(0, 0, ob.pos === 'bottom' ? 70 : -70);
                if (ob.spr) ob.spr.getComponent(Sprite).spriteFrame = FR['obstacle' + ob.type + '_crash'];
                this.hitObstacle = 30; this.playerSpeed *= 0.5; this.sfx('hurt');
                this.lives--; if (this.lives <= 0) { this.lives = 0; this.endGame(); }
                this.setHud();
              }
            }
          }
        }
        endGame() { this.gameState = GAME_STATE_OVER; this.sfx('lose'); this.stopMusic(); }

        /* ---------- main loop ---------- */
        update(dt) {
          if (this.state !== 'play') {
            if (this.state === 'welcome' && this.welcomeNode.active) {
              var tn = (Date.now() - (this.welcomeStart || Date.now())) / 1000;
              var restX = 200;
              var slide = clamp(tn / 1.2, 0, 1);
              var ease = slide * slide * (3 - 2 * slide);
              var wx = -SP.welcome_hero.ow + (restX + SP.welcome_hero.ow) * ease;
              this.wHero.setPosition(wx, WY(230 + Math.cos(tn * 2) * 25), 0);
              this.wPlay.y = WY(340 - Math.cos(tn * 2) * 10); this.wAbout.y = WY(460 - Math.cos(tn * 2) * 10);
            }
            return;
          }
          if (this.gamePaused) return;
          var elapsed = Math.min(dt, 0.05);
          var ga = this.gameArea;

          // hero animation
          this.heroAnimTime += elapsed;
          var fps = this.playerSpeed > HERO_MIN_SPEED + 100 ? 60 : 20;
          var frame = Math.floor(this.heroAnimTime * fps) % heroFrames.length;
          this.heroNode.getComponent(Sprite).spriteFrame = heroFrames[frame];

          if (this.gameState === GAME_STATE_IDLE) {
            if (this.heroX < DESIGN_W * 0.25) {
              this.heroX += ((DESIGN_W * 0.25 + 10) - this.heroX) * 0.05;
              this.heroY -= (this.heroY - this.touchY) * 0.1;
              this.playerSpeed += (HERO_MIN_SPEED - this.playerSpeed) * 0.05;
              this.scrollBg(this.playerSpeed);
            } else { this.gameState = GAME_STATE_FLYING; this.heroState = 1; }
            this.heroNode.setRotationFromEuler(0, 0, clamp(-(this.heroY - this.touchY) * 0.2, -30, 30));
            if (this.heroY > ga.bottom - SP.fly_0001.oh / 2) { this.heroY = ga.bottom - SP.fly_0001.oh / 2; this.heroNode.setRotationFromEuler(0, 0, 0); }
            if (this.heroY < ga.top + SP.fly_0001.oh / 2) { this.heroY = ga.top + SP.fly_0001.oh / 2; this.heroNode.setRotationFromEuler(0, 0, 0); }
            placeCenter(this.heroNode, this.heroX, this.heroY);
          } else if (this.gameState === GAME_STATE_FLYING) {
            if (this.coffee > 0) this.playerSpeed += (HERO_MAX_SPEED - this.playerSpeed) * 0.2;
            if (this.hitObstacle <= 0) {
              this.heroY -= (this.heroY - this.touchY) * 0.1;
              if (this.playerSpeed > HERO_MIN_SPEED + 100) { this.spawnWind(); this.heroAnimTime += elapsed; }
              else { if (this.coffeePS) this.coffeePS.getComponent(ParticleSystem2D).emitting = false; }
              this.heroNode.setRotationFromEuler(0, 0, clamp(-(this.heroY - this.touchY) * 0.2, -30, 30));
              if (this.heroY > ga.bottom - SP.fly_0001.oh / 2) { this.heroY = ga.bottom - SP.fly_0001.oh / 2; this.heroNode.setRotationFromEuler(0, 0, 0); }
              if (this.heroY < ga.top + SP.fly_0001.oh / 2) { this.heroY = ga.top + SP.fly_0001.oh / 2; this.heroNode.setRotationFromEuler(0, 0, 0); }
            } else {
              if (this.heroState !== 2) this.heroState = 2;
              this.hitObstacle -= 1;
              this.heroY -= (this.heroY - (ga.top + ga.bottom) / 2) * 0.1;
              this.heroNode.setRotationFromEuler(0, 0, this.heroY > DESIGN_H / 2 ? this.heroNode.eulerAngles.z - this.hitObstacle * 2 : this.heroNode.eulerAngles.z + this.hitObstacle * 2);
            }
            if (this.mushroom > 0) this.mushroom -= elapsed;
            if (this.coffee > 0) this.coffee -= elapsed;
            if (this.coffee <= 0 && this.coffeePS) this.coffeePS.getComponent(ParticleSystem2D).emitting = false;
            if (this.mushroom <= 0 && this.mushroomPS) this.mushroomPS.getComponent(ParticleSystem2D).emitting = false;
            this.playerSpeed -= (this.playerSpeed - HERO_MIN_SPEED) * 0.01;
            this.setFoodPattern(elapsed); this.spawnFood(elapsed); this.spawnObstacle(elapsed);
            this.animateFood(dt, elapsed); this.animateObstacles(dt, elapsed); this.animateEat(elapsed); this.animateWind(elapsed);
            this.scrollBg(this.playerSpeed);
            this.scoreDistance += this.playerSpeed * elapsed * 0.1;
            this.setHud();
            placeCenter(this.heroNode, this.heroX, this.heroY);
          } else if (this.gameState === GAME_STATE_OVER) {
            for (var i = 0; i < this.items.length; i++) if (this.items[i].alive) { this.items[i].alive = false; this.items[i].node.active = false; }
            for (var j = 0; j < this.obstacles.length; j++) if (this.obstacles[j].alive) { this.obstacles[j].alive = false; this.obstacles[j].node.active = false; }
            for (var m = 0; m < this.eatParts.length; m++) if (this.eatParts[m].alive) { this.eatParts[m].alive = false; this.eatParts[m].node.active = false; }
            for (var n = 0; n < this.windParts.length; n++) if (this.windParts[n].alive) { this.windParts[n].alive = false; this.windParts[n].node.active = false; }
            if (this.coffeePS) this.coffeePS.getComponent(ParticleSystem2D).emitting = false;
            if (this.mushroomPS) this.mushroomPS.getComponent(ParticleSystem2D).emitting = false;
            if (this.heroY < DESIGN_H + SP.fly_0001.oh) { this.playerSpeed -= this.playerSpeed * elapsed; this.heroY += DESIGN_H * elapsed; placeCenter(this.heroNode, this.heroX, this.heroY); }
            else { this.playerSpeed = 0; this.showGameOver(); }
          }

          // camera shake
          if (this.cameraShake > 0) {
            this.cameraShake -= 0.1;
            this.shakeX = Math.random() * this.cameraShake - this.cameraShake * 0.5;
            this.playNode.setPosition(this.shakeX, 0, 0);
          } else if (this.playNode.x !== 0) { this.shakeX = 0; this.playNode.setPosition(0, 0, 0); }
        }

        showGameOver() {
          this.state = 'over';
          this.overlayNode.active = true; this.uiNode.active = false;
          this.goDist.getComponent(Label).string = 'DISTANCE TRAVELLED: ' + Math.round(this.scoreDistance);
          this.goScore.getComponent(Label).string = 'SCORE: ' + this.scoreItems;
        }
      };

      // (spawnObstacle now takes elapsed directly)

      _export('boot', function boot() {
        return Promise.all([
          loadImage('assets/textures/mySpritesheet.png'),
          loadImage('assets/textures/bgWelcome.jpg'),
          loadImage('assets/textures/bgLayer1.jpg'),
          loadImage('assets/textures/particleTexture.png')
        ]).then(function (imgs) {
          SHEET = makeTex(imgs[0]);
          TEX_WELCOME = makeTex(imgs[1]);
          TEX_SKY = makeTex(imgs[2]);
          TEX_PARTICLE = makeTex(imgs[3]);
          for (var k in SP) { if (SP.hasOwnProperty(k)) FR[k] = sheetFrame(SHEET, k); }
          for (var i = 1; i <= 20; i++) heroFrames.push(sheetFrame(SHEET, 'fly_' + ('000' + i).slice(-4)));
          for (var j = 1; j <= 2; j++) obstacle4Frames.push(sheetFrame(SHEET, 'obstacle4_000' + j));
          for (var w = 1; w <= 5; w++) watchOutFrames.push(sheetFrame(SHEET, 'watchOut_000' + w));

          // Fixed 1024x768 design space, letterboxed into whatever the browser window is.
          // (settings.json should already ask for this, but the runtime build is also used
          // inside an <iframe>, so enforce it here as well.)
          try {
            if (cc.view && cc.ResolutionPolicy) {
              cc.view.setDesignResolutionSize(DESIGN_W, DESIGN_H, cc.ResolutionPolicy.SHOW_ALL);
            }
          } catch (e) {}

          var scene = new Scene('HungryHero');

          /* ------------------------------------------------------------------
           * Canvas (RenderRoot2D) + child Camera.
           *
           * Cocos 3.x only batches 2D sprites that live under a RenderRoot2D/Canvas
           * component: on enable it registers itself via Batcher2D.addScreen(), and the
           * UI pass walks those screens. A plain Node tree keeps a correct scene graph
           * but produces 0 draw calls, i.e. a blank screen.
           *
           * The Canvas node sits at the design centre so Canvas._onResizeCamera() places
           * the orthographic camera exactly over the 0..DESIGN_W / 0..DESIGN_H area.
           * ------------------------------------------------------------------ */
          var canvasNode = new Node('Canvas');
          canvasNode.setPosition(DESIGN_W / 2, DESIGN_H / 2, 0);
          scene.addChild(canvasNode);
          var canvasUT = canvasNode.addComponent(UITransform);
          canvasUT.setContentSize(DESIGN_W, DESIGN_H);

          var camNode = new Node('Camera');
          canvasNode.addChild(camNode);
          camNode.setPosition(0, 0, 1000);

          var cam = camNode.addComponent(Camera);
          // NOTE: 3.8 names these `projection` / `near` / `far` (not ortho / nearClip / farClip).
          cam.projection = (Camera.ProjectionType && Camera.ProjectionType.ORTHO != null)
            ? Camera.ProjectionType.ORTHO : 0;
          cam.orthoHeight = DESIGN_H / 2;
          cam.near = 1;
          cam.far = 3000;
          cam.clearFlags = 7;                       // COLOR | DEPTH | STENCIL
          cam.clearColor = new Color(10, 13, 20, 255);

          var canvas = canvasNode.addComponent(Canvas);
          canvas.cameraComponent = cam;
          try { canvas.renderMode = 0; } catch (e) {}   // screen mode -> camera priority |= 1<<30

          // Root keeps the original top-left design space (0..1024, 0..768): the Canvas
          // sits at the design centre, so Root is offset back to the world origin.
          var root = new Node('Root');
          root.setPosition(-DESIGN_W / 2, -DESIGN_H / 2, 0);
          canvasNode.addChild(root);

          var game = root.addComponent(Game);
          game.init(cc, {
            FR: FR, heroFrames: heroFrames, obstacle4Frames: obstacle4Frames, watchOutFrames: watchOutFrames,
            particleFrame: fullFrame(TEX_PARTICLE), TEX_BG_WELCOME: TEX_WELCOME, TEX_BG_SKY: TEX_SKY
          });

          cc.director.runSceneImmediate(scene);
          return game;
        });
      });
    }
  };
});
