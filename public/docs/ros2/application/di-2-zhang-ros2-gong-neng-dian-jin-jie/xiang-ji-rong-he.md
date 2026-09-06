#### 5.远程图传

如果相机连接在本地，图像一般是可以正常显示的，但是如果远程访问，可能会因为网络带宽限制，图像会出现延迟、卡顿、掉帧等现象，那么如何优化呢？

在ROS2中默认安装了名为`image_transport_plugins`的功能包，可以自动对图片做压缩处理，使用`ros2 topic list`指令可以查看到名为`/image_raw/compressed`的话题，该话题发布的就是压缩后的图片数据，我们可以在本地订阅该话题，提高图像传输效率。但是，rviz2不能直接使用该话题数据，我们需要在**本地**通过特定节点订阅压缩数据并解压缩后再发布，该节点执行示例如下：

```
ros2 run image_transport republish compressed --ros-args --remap in/compressed:=image_raw/compressed --remap out:=image_raw/uncompressed
```

重新启动`rviz2`，添加`image`插件，并将话题设置为：`image_raw/uncompressed`，图像显示效果，会有很大改善。

#### 6.多相机

同一机器人主体上，可能会安装多个相机，比如现有前后两个相机，那么应该如何同时启动这两个相机呢？

启动多个相机的方式与启动单个相机的大致流程类似，每个相机都需要执行相机启动节点并关联各自的配置文件，但是两个相机节点的节点名称、话题名称、所加载的参数等需要有所区分，比如可以使用命名空间避免节点重名、话题重名的问题，配置文件中设置不同坐标系等，一个具体的示例使用如下：

##### （1）.准备工作

请先按照**1.3.2 USB端口绑定**的相关内容为两个相机端口映射别名，比如可以分别为mycamera\_front和mycamera\_back。

##### （2）.编写launch文件

在mycar\_cam功能包的launch目录下新建名为usb\_cam2.launch.py的launch文件，并输入如下内容：

```py

```

##### （3）.编写配置文件

在params目录下为两个相机分别编写配置文件，前相机对应:params\_front.yaml和camera\_front.yaml；后相机对应:params\_back.yaml和camera\_back.yaml。

在params\_front.yaml中输入如下内容：

```yaml
/**:
    ros__parameters:
      video_device: "/dev/mycamera_front"
      framerate: 1.0
      io_method: "mmap"
      frame_id: "mycamera_front"
      pixel_format: "yuyv"
      image_width: 320
      image_height: 240
      camera_name: "mycamera_front"
      camera_info_url: "package://mycar_cam/params/camera_front.yaml"
```

在camera\_front.yaml中输入如下内容：

```yaml
image_width: 640
image_height: 480
camera_name: mycamera_front
camera_matrix:
  rows: 3
  cols: 3
  data: [438.783367, 0.000000, 305.593336, 0.000000, 437.302876, 243.738352, 0.000000, 0.000000, 1.000000]
distortion_model: plumb_bob
distortion_coefficients:
  rows: 1
  cols: 5
  data: [-0.361976, 0.110510, 0.001014, 0.000505, 0.000000]
rectification_matrix:
  rows: 3
  cols: 3
  data: [0.999978, 0.002789, -0.006046, -0.002816, 0.999986, -0.004401, 0.006034, 0.004417, 0.999972]
projection_matrix:
  rows: 3
  cols: 4
  data: [393.653800, 0.000000, 322.797939, 0.000000, 0.000000, 393.653800, 241.090902, 0.000000, 0.000000, 0.000000, 1.000000, 0.000000]
```

在params\_back.yaml中输入如下内容：

```yaml
/**:
    ros__parameters:
      video_device: "/dev/mycamera_back"
      framerate: 1.0
      io_method: "mmap"
      frame_id: "mycamera_back"
      pixel_format: "yuyv"
      image_width: 320
      image_height: 240
      camera_name: "mycamera_back"
      camera_info_url: "package://mycar_cam/params/camera_back.yaml"
```

在camera\_back.yaml中输入如下内容：

```yaml
image_width: 640
image_height: 480
camera_name: mycamera_back
camera_matrix:
  rows: 3
  cols: 3
  data: [438.783367, 0.000000, 305.593336, 0.000000, 437.302876, 243.738352, 0.000000, 0.000000, 1.000000]
distortion_model: plumb_bob
distortion_coefficients:
  rows: 1
  cols: 5
  data: [-0.361976, 0.110510, 0.001014, 0.000505, 0.000000]
rectification_matrix:
  rows: 3
  cols: 3
  data: [0.999978, 0.002789, -0.006046, -0.002816, 0.999986, -0.004401, 0.006034, 0.004417, 0.999972]
projection_matrix:
  rows: 3
  cols: 4
  data: [393.653800, 0.000000, 322.797939, 0.000000, 0.000000, 393.653800, 241.090902, 0.000000, 0.000000, 0.000000, 1.000000, 0.000000]
```

##### （4）.构建并执行

功能包构建后，执行launch文件，启动`rviz2`，添加`image`插件，并将话题分别设置为：

`/usb_cam_front/image_raw`和`/usb_cam_back/image_raw`，即可分别显示前后相机的图像数据。

