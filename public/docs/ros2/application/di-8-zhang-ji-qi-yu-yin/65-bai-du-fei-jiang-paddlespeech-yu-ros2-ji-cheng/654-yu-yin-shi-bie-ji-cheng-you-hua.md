### 6.5.4 语音识别集成优化

识别实时语音并转换成文本发布。

#### 0.准备工作

请先安装语音录制所需依赖：

```
pip install pynput sounddevice
sudo apt-get install portaudio19-dev
```

#### 1.语音识别优化核心实现

功能包ros2\_ps\_bridge的src目录下，新建文件v2t\_r.py，并编辑文件，输入如下内容：

```py
import rclpy
from rclpy.node import Node
from pynput.keyboard import Key, Listener
from threading import Thread, Lock
from queue import Queue
import sounddevice as sd
import soundfile as sf
import numpy as np
import threading
import time
from std_msgs.msg import String
from paddlespeech.cli.asr.infer import ASRExecutor

class AudioRecorderNode(Node):
    def __init__(self):
        super().__init__('audio_recorder')
        self.get_logger().info("录制节点启动!")
        self.is_recording = False
        self.audio_queue_lock = Lock()
        self.audio_queue = Queue()
        self.stop_event = threading.Event()
        self.recording = None
        self.pub_ = self.create_publisher(String,"asr_string",10)
        self.keyboard_thread = Thread(target=self.listen_to_keyboard, daemon=True) 
        self.keyboard_thread.start()

    def listen_to_keyboard(self):
        def on_press(key):
            if key == Key.space:
                if not self.is_recording:
                    self.start_recording()
                else:
                    self.stop_recording()

        with Listener(on_press=on_press) as listener:
            listener.join()

    def start_recording(self):
        if not self.is_recording: 
            self.is_recording = True
            self.stop_event.clear()
            self.get_logger().info('开始录音...')
            self.record_audio_thread = Thread(target=self.record_audio, daemon=True)
            self.record_audio_thread.start()

    def stop_recording(self):
        if self.is_recording:
            self.stop_event.set()
            self.is_recording = False
            self.get_logger().info('停止录音...')

    def record_audio(self):
        fs = 44100
        channels = 1

        def callback(indata, frames, time, status):
            with self.audio_queue_lock:
                self.audio_queue.put(indata.copy())

        with sd.InputStream(callback=callback, samplerate=fs, channels=channels) as stream:
            stream.start()
            while not self.stop_event.is_set():
                time.sleep(0.1)

            with self.audio_queue_lock:
                if not self.audio_queue.empty():
                    self.recording = np.concatenate(list(self.audio_queue.queue))
                    try:
                        sf.write('recording.wav', self.recording, fs)
                        self.get_logger().info('录音结束，数据已保存。')
                        if self.recording is not None:
                            asr = ASRExecutor()
                            result = asr(audio_file='recording.wav', model='conformer_wenetspeech')
                            self.get_logger().info("识别的文字为: %s" % result)
                            msg = String()
                            msg.data = result
                            self.pub_.publish(msg)
                            self.get_logger().info("发布的消息为: %s" % msg.data)

                    except Exception as e:
                        self.get_logger().error(f'保存录音时出错: {e}')
                    self.audio_queue.queue.clear()
                else:
                    self.get_logger().info('没有录音数据可保存。')

    def shutdown(self):
        self.stop_recording()

def main():
    rclpy.init()
    audio_recorder_node = AudioRecorderNode()
    rclpy.spin(audio_recorder_node)
    audio_recorder_node.shutdown()
    rclpy.shutdown()
if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

setup.py 中的配置如下：

```Cmake
entry_points={
    'console_scripts': [
        'v2t = ros2_ps_bridge.v2t:main',
        'v2t_r = ros2_ps_bridge.v2t_r:main',
        't2v = ros2_ps_bridge.t2v:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select ros2_ps_bridge
```

#### 4.执行

新建一个终端，打印订阅到的语音转文本相关话题数据，指令如下：

```
ros2 topic echo /asr_string
```

当前工作空间下，再启动一个终端，并输入如下指令：

```
. install/setup.bash
ros2 run ros2_ps_bridge v2t_r
```

程序正常执行后，按下空格，开始录入语音，再次按下空格后，录音结束，此时，语音将被转换成文字并发布。

